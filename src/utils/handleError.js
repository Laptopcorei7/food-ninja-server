// One place that turns an unexpected error into a response. Client mistakes get a 400 with a
// useful message; anything else is logged here and the client gets a generic 500, never the
// raw message or stack (those can carry DB, Twilio or file-system details).
function handleError(res, err) {
  if (err.name === 'CastError')
    return res.status(400).json({ success: false, message: 'Invalid id' });
  if (err.name === 'ValidationError')
    return res.status(400).json({ success: false, message: err.message });

  console.error(err);
  return res.status(500).json({ success: false, message: 'Something went wrong, please try again' });
}

module.exports = { handleError };
