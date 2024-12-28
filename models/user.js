const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firstName: String,
    email: String,
    solanaAddress: String,
    userIP: String,
    submittedDate: { type: Date, default: Date.now },
    isEmailVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationExpires: Date,
    correctAnswers: { type: Number, default: 0 } // Nouveau champ
}, { collection: 'users' });

module.exports = mongoose.model('User', userSchema);