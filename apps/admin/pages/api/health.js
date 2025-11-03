export default function handler(req, res) {
  res.status(200).json({ ok: true, service: 'admin', time: new Date().toISOString() });
}
