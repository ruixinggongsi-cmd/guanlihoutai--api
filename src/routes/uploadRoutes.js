import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile } from '../config/supabase.js';

const router = express.Router();

// 配置内存存储引擎
const storage = multer.memoryStorage();

// 创建multer实例
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 限制文件大小为100MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片和文档文件类型
    const allowedTypes = [
      // 图片类型
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      // 文档类型
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'application/x-rar-compressed'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型，只允许图片和文档文件'));
    }
  }
});

// 附件上传接口
router.post('/attachments', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有文件被上传' });
    }
    
    // 生成唯一的文件名
    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    
    // 上传文件到Supabase存储
    const result = await uploadFile('attachments', fileName, req.file.buffer, req.file.mimetype);
    
    // 返回文件URL和其他信息
    res.status(201).json({
      success: true,
      data: {
        url: result.url,
        path: result.path,
        fileName: fileName,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });
  } catch (error) {
    console.error('附件上传失败:', error);
    res.status(500).json({
      success: false,
      error: '附件上传失败',
      details: error.message
    });
  }
});

export default router;