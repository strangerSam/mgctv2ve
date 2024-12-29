require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const transporter = require('./config/emailConfig');
const rateLimit = require('express-rate-limit');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// Movie Schema
const movieSchema = new mongoose.Schema({
  title: String,
  screenshot: String
}, { collection: 'movies' });

const Movie = mongoose.model('Movie', movieSchema);

// User Schema
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

// Attempt Schema
const attemptSchema = new mongoose.Schema({
    userIP: String,
    date: { type: Date, default: Date.now },
    attempts: { type: Number, default: 0 }
});

const Attempt = mongoose.model('Attempt', attemptSchema);

// Route pour obtenir l'image du jour
app.get('/api/daily-movie', async (req, res) => {
  try {
    const count = await Movie.countDocuments();
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const index = dayOfYear % count;
    
    const movie = await Movie.findOne().skip(index);
    
    if (!movie) {
      return res.status(404).json({ message: 'No movie found' });
    }
    
    res.json({ 
      title: movie.title,
      screenshot: movie.screenshot
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Route pour obtenir/incrémenter les tentatives
app.post('/api/attempt', attemptLimiter, async (req, res) => {
    const userIP = req.ip;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    try {
        let attempt = await Attempt.findOne({
            userIP,
            date: { $gte: today }
        });
        
        if (!attempt) {
            attempt = new Attempt({ userIP });
        }
        
        attempt.attempts += 1;
        await attempt.save();
        
        res.json({ 
            attempts: attempt.attempts,
            remainingAttempts: 5 - attempt.attempts // Ajout du nombre de tentatives restantes
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Route pour obtenir le nombre de tentatives actuel
app.get('/api/attempt', async (req, res) => {
    const userIP = req.ip;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    try {
        const attempt = await Attempt.findOne({
            userIP,
            date: { $gte: today }
        });
        
        res.json({ attempts: attempt ? attempt.attempts : 0 });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Configuration du rate limiter pour les tentatives
const attemptLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // limite à 5 tentatives par minute
    message: { 
        error: 'Too many attempts. Please wait a minute before trying again.' 
    },
    standardHeaders: true, // Retourne les headers `RateLimit-*`
    legacyHeaders: false, // Désactive les headers `X-RateLimit-*`
});


// Route pour réinitialiser les tentatives
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

// Route pour vérifier la participation
app.get('/api/check-participation', async (req, res) => {
    const userIP = req.ip;
    const adminCode = req.query.adminCode;
    const testMode = req.query.testMode === 'true';
    const userId = req.query.userId; // Pour les utilisateurs enregistrés
    
    if (adminCode === process.env.ADMIN_CODE || testMode) {
        return res.json({ hasParticipated: false });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    try {
        let user = null;
        
        // Vérifier d'abord si c'est un utilisateur enregistré
        if (userId) {
            user = await RegisteredUser.findOne({
                _id: userId,
                lastParticipation: { $gte: today }
            });
            
            if (user) {
                return res.json({ 
                    hasParticipated: true,
                    userInfo: {
                        email: user.email,
                        solanaAddress: user.solanaAddress,
                        isRegistered: true,
                        points: user.points
                    }
                });
            }
        }

        // Si pas d'utilisateur enregistré, vérifier l'IP
        user = await IpUser.findOne({
            userIP: userIP,
            lastActive: { $gte: today }
        });
        
        if (user) {
            return res.json({ 
                hasParticipated: true,
                userInfo: {
                    email: user.email,
                    solanaAddress: user.solanaAddress,
                    isRegistered: false,
                    points: user.points
                }
            });
        }
        
        res.json({ hasParticipated: false });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Configuration du rate limiter pour les soumissions d'utilisateurs
const submissionLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 heures
    max: 1, // Une seule soumission par jour
    message: { 
        error: 'You can only submit your information once per day.' 
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Route pour incrémenter le score
app.post('/api/increment-score', async (req, res) => {
    try {
        const { email, solanaAddress, movieTitle } = req.body;
        
        // Ajout de logs pour déboguer
        console.log('Updating score for:', { email, solanaAddress, movieTitle });
        
        const user = await User.findOne({ 
            email: email,
            solanaAddress: solanaAddress
        });

        if (!user) {
            console.log('User not found');
            return res.status(404).json({ message: 'User not found' });
        }

        console.log('Current user state:', {
            correctAnswers: user.correctAnswers,
            solvedMovies: user.solvedMovies
        });

        // Vérifier si le film n'a pas déjà été trouvé
        if (!user.solvedMovies.includes(movieTitle)) {
            user.correctAnswers += 1;
            user.solvedMovies.push(movieTitle);
            await user.save();

            console.log('Updated user state:', {
                correctAnswers: user.correctAnswers,
                solvedMovies: user.solvedMovies
            });

            res.json({ 
                message: 'Score updated successfully',
                newScore: user.correctAnswers,
                solvedMovies: user.solvedMovies
            });
        } else {
            console.log('Movie already solved');
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

// pour récupérer le score actuel
app.get('/api/user-score', async (req, res) => {
    try {
        const { email, solanaAddress } = req.query;
        
        const user = await User.findOne({ 
            email: email,
            solanaAddress: solanaAddress
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ 
            correctAnswers: user.correctAnswers,
            solvedMovies: user.solvedMovies
        });
    } catch (error) {
        console.error('Get score error:', error);
        res.status(500).json({ message: error.message });
    }
});


// Route pour soumettre un utilisateur
app.post('/api/submit-user', submissionLimiter, async (req, res) => {
    try {
        console.log('--- Début de la soumission ---');
        const { firstName, email, solanaAddress } = req.body;
        const userIP = req.ip;
        const adminCode = req.headers['admin-code'];
        const testMode = req.headers['test-mode'] === 'true';
        
        console.log('Email soumis:', email);
        console.log('Solana Address soumise:', solanaAddress);
        console.log('Admin code présent:', !!adminCode);
        console.log('Test mode actif:', testMode);

        // Vérifier si l'email ou l'adresse Solana existent déjà
        const existingUser = await User.findOne({
            $or: [
                { email: email },
                { solanaAddress: solanaAddress }
            ]
        });

        if (existingUser) {
            let errorMessage = '';
            if (existingUser.email === email && existingUser.solanaAddress === solanaAddress) {
                errorMessage = 'This email and Solana address combination is already registered.';
            } else if (existingUser.email === email) {
                errorMessage = 'This email is already registered.';
            } else {
                errorMessage = 'This Solana address is already registered.';
            }
            return res.status(400).json({ message: errorMessage });
        }

        // Si c'est un admin ou en mode test
        if (adminCode === process.env.ADMIN_CODE || testMode) {
            console.log('Mode admin ou test détecté');
            const user = new User({
                firstName,
                email,
                solanaAddress,
                userIP,
                isEmailVerified: true
            });
            await user.save();
            console.log('Sauvegarde admin/test réussie');
            return res.json({ message: 'Information submitted successfully (Admin/Test mode)' });
        }

        console.log('Recherche d\'un email déjà vérifié');
        const existingVerifiedUser = await User.findOne({
            email: email,
            isEmailVerified: true
        });

        console.log('Résultat de la recherche:', existingVerifiedUser);

        if (existingVerifiedUser) {
            console.log('Email déjà vérifié trouvé');
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

        // Si l'email n'est pas encore vérifié, processus normal de vérification
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

// Route de vérification d'email
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
