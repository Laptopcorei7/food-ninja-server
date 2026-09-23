const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype))
    return cb(null, true);
  const err = new Error('Only JPEG, PNG or WebP images are allowed');
  err.status = 400;
  err.expose = true;
  cb(err);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = upload;
