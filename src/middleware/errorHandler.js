export function notFound(req, res, next) {
  const err = new Error(`Not found - ${req.originalUrl}`);
  res.status(404);
  next(err);
}

export function errorHandler(err, req, res, next) {
  const status = res.statusCode === 200 ? 500 : res.statusCode;
  console.error(err);
  res.status(status).json({ message: err.message || 'Server error', stack: process.env.NODE_ENV === 'production' ? undefined : err.stack });
}
