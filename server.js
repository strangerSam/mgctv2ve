require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const transporter = require('./config/emailConfig');
const rateLimit = require('express-rate-limit');
const moment = require('moment-timezone');

const app = express();

// Configuration des rate limiters
const walletLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 tentatives maximum
    message: { 
        error: 'Too many connection attempts. Please try again later.' 
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware de base
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Appliquer le rate limiter aux routes de connexion wallet
app.use('/api/wallet-connect', walletLimiter);

// Configuration du rate limiter pour les soumissions
const submissionLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 heures
    max: 1, // Une seule soumission par jour
    message: { 
        error: 'You can only submit your information once per day.' 
    },
    keyGenerator: (req) => {
        // Utiliser l'adresse Solana comme clé pour le rate limiting
        return req.body.solanaAddress || req.ip;
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

// Mise à jour du schéma utilisateur pour le wallet
const userSchema = new mongoose.Schema({
    solanaAddress: { 
        type: String, 
        required: true,
        unique: true 
    },
    email: { 
        type: String, 
        required: true 
    },
    isEmailVerified: { 
        type: Boolean, 
        default: false 
    },
    verificationToken: String,
    verificationExpires: Date,
    correctAnswers: { 
        type: Number, 
        default: 0 
    },
    solvedMovies: [String],
    lastParticipation: Date
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

// Fonction pour récupérer le film du jour
async function getDailyMovie() {
    try {
        const parisTime = moment().tz("Europe/Paris");
        const currentDate = parisTime.startOf('day');
        const count = await Movie.countDocuments();
        
        if (count === 0) {
            throw new Error('No movies found in database');
        }

        const startOfYear = moment().tz("Europe/Paris").startOf('year');
        const dayOfYear = currentDate.diff(startOfYear, 'days');
        const index = dayOfYear % count;
        const movie = await Movie.findOne().skip(index);

        if (!movie) {
            throw new Error('No movie found for today');
        }

        return movie;
    } catch (error) {
        console.error('Error in getDailyMovie:', error);
        throw error;
    }
}

// Routes
app.get('/api/daily-movie', async (req, res) => {
    try {
        const movie = await getDailyMovie();
        const parisTime = moment().tz("Europe/Paris");
        const nextUpdate = parisTime.clone().add(1, 'day').startOf('day');
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

app.get('/api/check-user', async (req, res) => {
    try {
        const { address } = req.query;
        if (!address) {
            return res.status(400).json({ message: 'Solana address is required' });
        }

        const user = await User.findOne({ solanaAddress: address });
        res.json({ exists: !!user, user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/check-participation', async (req, res) => {
    const { solanaAddress } = req.query;
    const adminCode = req.query.adminCode;
    const testMode = req.query.testMode === 'true';
    
    if (adminCode === process.env.ADMIN_CODE || testMode) {
        return res.json({ hasParticipated: false });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    try {
        const user = await User.findOne({
            solanaAddress,
            lastParticipation: { $gte: today }
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

app.get('/api/check-movie-solved', async (req, res) => {
    try {
        const { solanaAddress } = req.query;
        if (!solanaAddress) {
            return res.status(400).json({ message: 'Solana address is required' });
        }

        const user = await User.findOne({ solanaAddress });
        if (!user) {
            return res.json({ isSolved: false });
        }

        // Utiliser la fonction getDailyMovie
        const movie = await getDailyMovie();
        const isSolved = user.solvedMovies.includes(movie.title);
        
        res.json({ 
            isSolved,
            movieTitle: isSolved ? movie.title : null
        });

    } catch (error) {
        console.error('Error checking solved movie:', error);
        res.status(500).json({
            message: 'Internal server error',
            isSolved: false
        });
    }
});

app.post('/api/submit-user', submissionLimiter, async (req, res) => {
    try {
        const { email, solanaAddress } = req.body;
        const adminCode = req.headers['admin-code'];
        const testMode = req.headers['test-mode'] === 'true';

        // Vérification de l'adresse Solana
        if (!solanaAddress || solanaAddress.length !== 44) {
            return res.status(400).json({ 
                message: 'Invalid Solana address',
                error: 'INVALID_SOLANA_ADDRESS'
            });
        }

        let user = await User.findOne({ solanaAddress });

        if (user) {
            // Mettre à jour l'email si l'utilisateur existe déjà
            user.email = email;
            user.lastParticipation = new Date();
            await user.save();
            return res.json({ message: 'Participation recorded successfully!' });
        }

        // Création d'un nouvel utilisateur
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date();
        verificationExpires.setHours(verificationExpires.getHours() + 24);

        user = new User({
            email,
            solanaAddress,
            lastParticipation: new Date(),
            verificationToken,
            verificationExpires,
            isEmailVerified: adminCode === process.env.ADMIN_CODE || testMode
        });
        
        await user.save();

        if (!user.isEmailVerified) {
            const verificationLink = `https://mgctv2ve-backend.onrender.com/verify-email/${verificationToken}`;
            
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Verify your email for The Moviegoers Cats',
                html: `
                    <h1>Welcome to The Moviegoers Cats!</h1>
                    <p>Thanks for participating! Please click the link below to verify your email address:</p>
                    <a href="${verificationLink}">Verify Email</a>
                    <p>This link will expire in 24 hours.</p>
                `
            });

            return res.json({ 
                message: 'Please check your email to verify your account',
                requiresVerification: true
            });
        }

        res.json({ message: 'Registration successful!' });

    } catch (error) {
        console.error('Save error:', error);
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/increment-score', async (req, res) => {
    try {
        const { solanaAddress, movieTitle } = req.body;
        
        if (!solanaAddress || !movieTitle) {
            return res.status(400).json({ 
                message: 'Missing required fields' 
            });
        }

        let user = await User.findOne({ solanaAddress });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Vérifier si le film n'est pas déjà dans solvedMovies
        if (!user.solvedMovies.includes(movieTitle)) {
            user.correctAnswers += 1;
            user.solvedMovies.push(movieTitle);
            await user.save();

            console.log(`User ${solanaAddress} solved movie: ${movieTitle}`);
            console.log(`New score: ${user.correctAnswers}`);
            console.log(`Solved movies: ${user.solvedMovies.join(', ')}`);

            return res.json({ 
                message: 'Score updated successfully',
                newScore: user.correctAnswers,
                solvedMovies: user.solvedMovies
            });
        } else {
            return res.json({ 
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

app.post('/api/wallet-connect', walletLimiter, (req, res) => {
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});