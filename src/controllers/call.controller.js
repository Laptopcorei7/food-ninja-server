// Voice calling via Agora RTC — not yet implemented.
// Requires AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env.
// Implement when the driver app is built.

exports.getCallToken = async (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Voice calling is not yet implemented. It will be added when the driver app is built.',
  });
};
