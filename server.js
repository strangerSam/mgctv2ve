require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const transporter = require('./config/emailConfig');
const rateLimit = require('express-rate-limit');
const moment = require('moment-timezone');

const app = express();

// Middleware de base
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuration des rate limiters
const attemptLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // limite à 5 tentatives par minute
    message: { 
        error: 'Too many attempts. Please wait a minute before trying again.' 
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const submissionLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 heures
    max: 1, // Une seule soumission par jour
    message: { 
        error: 'You can only submit your information once per day.' 
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// Schémas
const movieSchema = new mongoose.Schema({
    title: String,
    screenshot: String
}, { collection: 'movies' });

const Movie = mongoose.model('Movie', movieSchema);

const userSchema = new mongoose.Schema({
    firstName: String,
    email: String,
    solanaAddress: String,
    userIP: String,
    submittedDate: { type: Date, default: Date.now },
    isEmailVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationExpires: Date,
    correctAnswers: { type: Number, default: 0 },
    solvedMovies: [String]
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

const attemptSchema = new mongoose.Schema({
    userIP: String,
    date: { type: Date, default: Date.now },
    attempts: { type: Number, default: 0 }
});

const Attempt = mongoose.model('Attempt', attemptSchema);

// Routes
app.get('/api/daily-movie', async (req, res) => {
    try {
        // Utiliser moment.js pour une meilleure gestion des fuseaux horaires
        const parisTime = moment().tz("Europe/Paris");
        console.log(`Current Paris time: ${parisTime.format()}`);
        
        // Reset à minuit pour la consistance
        const currentDate = parisTime.startOf('day');
        console.log(`Normalized date: ${currentDate.format()}`);
        
        const count = await Movie.countDocuments();
        console.log(`Total movies in database: ${count}`);
        
        if (count === 0) {
            return res.status(404).json({ 
                message: 'No movies found in database',
                error: 'EMPTY_DATABASE'
            });
        }

        // Calcul du jour de l'année
        const startOfYear = moment().tz("Europe/Paris").startOf('year');
        const dayOfYear = currentDate.diff(startOfYear, 'days');
        console.log(`Day of year: ${dayOfYear}`);
        
        const index = dayOfYear % count;
        console.log(`Selected movie index: ${index}`);

        const movie = await Movie.findOne().skip(index);
        
        if (!movie) {
            return res.status(404).json({ 
                message: 'Movie not found for today',
                error: 'MOVIE_NOT_FOUND'
            });
        }

        // Calcul du prochain changement
        const nextUpdate = parisTime.clone().add(1, 'day').startOf('day');
        console.log(`Next update scheduled for: ${nextUpdate.format()}`);

        // Ajout du temps restant en minutes
        const minutesUntilNextUpdate = nextUpdate.diff(parisTime, 'minutes');
        
        res.json({ 
            title: movie.title,
            screenshot: movie.screenshot,
            currentTime: parisTime.format(),
            nextUpdate: nextUpdate.format(),
            minutesUntilNext: minutesUntilNextUpdate,
            timeInfo: {
                currentParis: parisTime.format('HH:mm'),
                nextChange: nextUpdate.format('YYYY-MM-DD HH:mm'),
                minutesRemaining: minutesUntilNextUpdate
            }
        });

    } catch (error) {
        console.error('Error in daily-movie route:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: error.message 
        });
    }
});

// Route pour les tentatives avec rate limiting
app.post('/api/attempt', attemptLimiter, async (req, res) => {
    const userIP = req.ip;
    const now = new Date();
    const oneMinuteAgo = new Date(now - 60000); // 1 minute ago
    
    try {
        // Rechercher ou créer une tentative pour cet IP
        let attempt = await Attempt.findOne({
            userIP,
            date: { $gte: oneMinuteAgo }
        });
        
        if (!attempt) {
            attempt = new Attempt({ 
                userIP,
                date: now,
                attempts: 0 
            });
        }
        
        // Incrémenter le compteur
        attempt.attempts += 1;
        attempt.date = now;
        await attempt.save();
        
        // Calculer les tentatives restantes
        const remainingAttempts = Math.max(0, 5 - attempt.attempts);
        
        res.json({ 
            attempts: attempt.attempts,
            remainingAttempts,
            resetTime: new Date(now.getTime() + 60000).toISOString()
        });
    } catch (error) {
        console.error('Erreur lors du traitement de la tentative:', error);
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/attempt', attemptLimiter, async (req, res) => {
    const userIP = req.ip;
    const now = new Date();
    const oneMinuteAgo = new Date(now - 60000); // 1 minute ago
    
    try {
        // Rechercher ou créer une tentative pour cet IP
        let attempt = await Attempt.findOne({
            userIP,
            date: { $gte: oneMinuteAgo }
        });
        
        if (!attempt) {
            attempt = new Attempt({ 
                userIP,
                date: now,
                attempts: 0 
            });
        }
        
        // Incrémenter le compteur
        attempt.attempts += 1;
        attempt.date = now;
        await attempt.save();
        
        // Calculer les tentatives restantes
        const remainingAttempts = Math.max(0, 5 - attempt.attempts);
        
        res.json({ 
            attempts: attempt.attempts,
            remainingAttempts,
            resetTime: new Date(now.getTime() + 60000).toISOString()
        });
    } catch (error) {
        console.error('Erreur lors du traitement de la tentative:', error);
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/reset-attempts', async (req, res) => {
    const userIP = req.ip;
    try {
        await Attempt.deleteOne({
            userIP,
            date: { $gte: new Date().setHours(0,0,0,0) }
        });
        res.json({ message: 'Attempts reset successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/check-participation', async (req, res) => {
    const userIP = req.ip;
    const adminCode = req.query.adminCode;
    const testMode = req.query.testMode === 'true';
    
    if (adminCode === process.env.ADMIN_CODE || testMode) {
        return res.json({ hasParticipated: false });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    try {
        const user = await User.findOne({
            userIP: userIP,
            submittedDate: { $gte: today }
        });
        
        if (user) {
            return res.json({ 
                hasParticipated: true,
                userInfo: {
                    email: user.email,
                    solanaAddress: user.solanaAddress
                }
            });
        }
        
        res.json({ hasParticipated: false });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/increment-score', async (req, res) => {
    try {
        const { email, solanaAddress, movieTitle } = req.body;
        
        console.log('Updating score for:', { email, solanaAddress, movieTitle });
        
        const user = await User.findOne({ 
            email: email,
            solanaAddress: solanaAddress
        });

        if (!user) {
            console.log('User not found');
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.solvedMovies.includes(movieTitle)) {
            user.correctAnswers += 1;
            user.solvedMovies.push(movieTitle);
            await user.save();

            res.json({ 
                message: 'Score updated successfully',
                newScore: user.correctAnswers,
                solvedMovies: user.solvedMovies
            });
        } else {
            res.json({ 
                message: 'Movie already solved',
                newScore: user.correctAnswers,
                solvedMovies: user.solvedMovies
            });
        }
    } catch (error) {
        console.error('Update score error:', error);
        res.status(500).json({ message: error.message });
    }
});

function isValidSolanaAddress(address) {
    if (typeof address !== 'string' || address.length !== 44) {
        return false;
    }

    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    if (!base58Regex.test(address)) {
        return false;
    }

    return true;
}

app.post('/api/submit-user', submissionLimiter, async (req, res) => {
    try {
        console.log('--- Début de la soumission ---');
        const { firstName, email, solanaAddress } = req.body;
        const userIP = req.ip;
        const adminCode = req.headers['admin-code'];
        const testMode = req.headers['test-mode'] === 'true';
        
        console.log('Email soumis:', email);
        console.log('Solana Address soumise:', solanaAddress);

        if (!isValidSolanaAddress(solanaAddress)) {
            return res.status(400).json({ 
                message: 'Invalid Solana address format. Please provide a valid Solana address.',
                error: 'INVALID_SOLANA_ADDRESS'
            });
        }

        const existingUser = await User.findOne({
            $or: [
                { email: email },
                { solanaAddress: solanaAddress }
            ]
        });

        if (existingUser) {
            let errorMessage = existingUser.email === email && existingUser.solanaAddress === solanaAddress
                ? 'This email and Solana address combination is already registered.'
                : existingUser.email === email
                ? 'This email is already registered.'
                : 'This Solana address is already registered.';
            return res.status(400).json({ message: errorMessage });
        }

        if (adminCode === process.env.ADMIN_CODE || testMode) {
            const user = new User({
                firstName,
                email,
                solanaAddress,
                userIP,
                isEmailVerified: true
            });
            await user.save();
            return res.json({ message: 'Information submitted successfully (Admin/Test mode)' });
        }

        const existingVerifiedUser = await User.findOne({
            email: email,
            isEmailVerified: true
        });

        if (existingVerifiedUser) {
            const user = new User({
                firstName,
                email,
                solanaAddress,
                userIP,
                isEmailVerified: true
            });
            
            await user.save();
            return res.json({ message: 'Information submitted successfully! Thank you for participating.' });
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date();
        verificationExpires.setHours(verificationExpires.getHours() + 24);

        const user = new User({
            firstName,
            email,
            solanaAddress,
            userIP,
            verificationToken,
            verificationExpires
        });
        
        await user.save();

        const verificationLink = `https://mgctv2ve-backend.onrender.com/verify-email/${verificationToken}`;
        
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Verify your email for The Moviegoers Cats',
            html: `
                <h1>Welcome to The Moviegoers Cats!</h1>
                <p>Hi ${firstName},</p>
                <p>Thanks for participating! Please click the link below to verify your email address:</p>
                <a href="${verificationLink}">Verify Email</a>
                <p>This link will expire in 24 hours.</p>
            `
        });

        res.json({ 
            message: 'Please check your email to verify your account. Check your spam folder if you don\'t see it.',
            requiresVerification: true
        });

    } catch (error) {
        console.error('Save error:', error);
        res.status(500).json({ message: error.message });
    }
});

app.get('/verify-email/:token', async (req, res) => {
    try {
        const user = await User.findOne({ 
            verificationToken: req.params.token,
            verificationExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).send('Invalid or expired verification link.');
        }

        user.isEmailVerified = true;
        user.verificationToken = undefined;
        user.verificationExpires = undefined;
        await user.save();

        res.send('Email verified successfully! You can now close this window.');
    } catch (error) {
        res.status(500).send('Error verifying email.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});