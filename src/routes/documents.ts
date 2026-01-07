import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';
import { storageService } from '../services/storage.service.js';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure multer for memory storage (we'll handle storage ourselves)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'application/json',
    ];

    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('text/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// Get all documents
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = req.query;

    const where: { userId: string; type?: 'RESUME' | 'JOB_DESCRIPTION' | 'COMPANY_INFO' | 'NOTES' | 'CODE' | 'GENERAL' } = {
      userId: req.user!.id,
    };

    if (type) {
      where.type = String(type) as 'RESUME' | 'JOB_DESCRIPTION' | 'COMPANY_INFO' | 'NOTES' | 'CODE' | 'GENERAL';
    }

    const documents = await prisma.document.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        mimeType: true,
        size: true,
        textLength: true,
        language: true,
        isCode: true,
        codeLanguage: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ documents });
  } catch (error) {
    next(error);
  }
});

// Get single document
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await prisma.document.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    res.json({ document });
  } catch (error) {
    next(error);
  }
});

// Upload document
router.post('/', authenticate, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    const { type = 'GENERAL', name } = req.body;

    if (!file) {
      throw ApiError.badRequest('No file uploaded');
    }

    // Check document limit
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { subscriptionStatus: true },
    });

    const planKey = user?.subscriptionStatus === 'ACTIVE' ? 'pro' : 'free';
    const planLimits = config.plans[planKey as keyof typeof config.plans];

    const documentsCount = await prisma.document.count({
      where: { userId: req.user!.id },
    });

    if (planLimits.maxDocuments !== -1 && documentsCount >= planLimits.maxDocuments) {
      throw ApiError.tooManyRequests('Document limit reached. Upgrade for more storage.');
    }

    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + path.extname(file.originalname);

    // Upload to storage (local or S3)
    const uploadResult = await storageService.upload(file.buffer, filename, file.mimetype);

    // Read file content for text-based files
    let textContent = '';
    if (file.mimetype.startsWith('text/') || file.mimetype === 'application/json') {
      textContent = file.buffer.toString('utf-8');
    }

    // Detect if it's code
    const codeExtensions = ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.rb', '.php'];
    const ext = path.extname(file.originalname).toLowerCase();
    const isCode = codeExtensions.includes(ext);

    const document = await prisma.document.create({
      data: {
        userId: req.user!.id,
        name: name || file.originalname,
        type: type as 'RESUME' | 'JOB_DESCRIPTION' | 'COMPANY_INFO' | 'NOTES' | 'CODE' | 'GENERAL',
        mimeType: file.mimetype,
        size: file.size,
        storagePath: uploadResult.key,
        textContent: textContent || null,
        textLength: textContent.length,
        isCode,
        codeLanguage: isCode ? ext.substring(1) : null,
      },
    });

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: document.id,
        name: document.name,
        type: document.type,
        size: document.size,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update document metadata
router.patch('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, type } = req.body;

    const document = await prisma.document.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
      },
    });

    res.json({ document: updated });
  } catch (error) {
    next(error);
  }
});

// Delete document
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await prisma.document.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    // Delete file from storage (local or S3)
    await storageService.delete(document.storagePath);

    await prisma.document.delete({ where: { id: req.params.id } });

    res.json({ message: 'Document deleted' });
  } catch (error) {
    next(error);
  }
});

// Get document content
router.get('/:id/content', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await prisma.document.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
      select: {
        textContent: true,
        mimeType: true,
        storagePath: true,
        name: true,
      },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    if (document.textContent) {
      res.json({ content: document.textContent });
    } else {
      // For binary files, get from storage and serve
      if (storageService.isS3()) {
        // For S3, return a signed URL for direct download
        const url = await storageService.getUrl(document.storagePath);
        res.json({ downloadUrl: url });
      } else {
        // For local storage, stream the file
        const buffer = await storageService.download(document.storagePath);
        res.setHeader('Content-Type', document.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${document.name}"`);
        res.send(buffer);
      }
    }
  } catch (error) {
    next(error);
  }
});

export default router;
