const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema({
    userIP: String,
    date: { type: Date, default: Date.now },
    attempts: { type: Number, default: 0 }
});

module.exports = mongoose.model('Attempt', attemptSchema);