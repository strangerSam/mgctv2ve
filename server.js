require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const transporter = require('./config/emailConfig');
const rateLimit = require('express-rate-limit');
const moment = require('moment-timezone');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const app = express();

// Configuration de sécurité de base
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "fonts.gstatic.com"],
        connectSrc: ["'self'"]
    }
}));

// Configuration CORS sécurisée
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://www.moviegoers-cats.com'],
    methods: ['GET', 'POST'],
    credentials: true,
    maxAge: 86400, // 24 heures
};
app.use(cors(corsOptions));

// Configuration des sessions sécurisées
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET,
    name: 'sessionId', // Change le nom par défaut du cookie
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 heures
        sameSite: 'strict'
    }
}));

// Middleware de base
app.use(express.json({ limit: '10kb' })); // Limite la taille des requêtes JSON
app.use(express.static('public', {
    maxAge: '1d', // Cache-Control pour les fichiers statiques
    setHeaders: function (res, path) {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Rate Limiters
const walletLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: { error: 'Too many connection attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const submissionLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 1,
    message: { error: 'You can only submit your information once per day.' },
    keyGenerator: (req) => req.body.solanaAddress || req.ip,
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests from this IP' }
});

// Middleware de vérification JWT
const verifyToken = (req, res, next) => {
    const token = req.session.token || req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// MongoDB Connection sécurisée
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// Schémas
const movieSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true,
        trim: true
    },
    screenshot: { 
        type: String, 
        required: true,
        validate: {
            validator: function(v) {
                return /^https:\/\//.test(v); // Vérifie que l'URL est en HTTPS
            },
            message: 'Screenshot URL must be HTTPS'
        }
    }
}, { 
    collection: 'movies',
    timestamps: true
});

const Movie = mongoose.model('Movie', movieSchema);

// Mise à jour du schéma utilisateur avec validation renforcée
const userSchema = new mongoose.Schema({
    solanaAddress: { 
        type: String, 
        required: true,
        unique: true,
        validate: {
            validator: function(v) {
                return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
            },
            message: 'Invalid Solana address format'
        }
    },
    email: { 
        type: String, 
        required: true,
        lowercase: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: 'Invalid email format'
        }
    },
    isEmailVerified: { 
        type: Boolean, 
        default: false 
    },
    verificationToken: String,
    verificationExpires: Date,
    correctAnswers: { 
        type: Number, 
        default: 0,
        min: 0
    },
    solvedMovies: [String],
    lastParticipation: Date,
    lastLoginAttempt: Date,
    loginAttempts: {
        type: Number,
        default: 0
    }
}, { 
    collection: 'users',
    timestamps: true
});

const User = mongoose.model('User', userSchema);

// Fonction sécurisée pour récupérer le film du jour
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
        
        const movie = await Movie.findOne()
            .select('title screenshot') // Sélectionne uniquement les champs nécessaires
            .skip(index)
            .lean(); // Performance optimisation

        if (!movie) {
            throw new Error('No movie found for today');
        }

        return movie;
    } catch (error) {
        console.error('Error in getDailyMovie:', error);
        throw error;
    }
}

// Routes avec la sécurité renforcée
app.post('/api/wallet-connect', walletLimiter, (req, res) => {
    res.json({ success: true });
});

app.get('/api/daily-movie', apiLimiter, async (req, res) => {
    try {
        const movie = await getDailyMovie();
        const parisTime = moment().tz("Europe/Paris");
        const nextUpdate = parisTime.clone().add(1, 'day').startOf('day');
        
        res.json({ 
            title: movie.title,
            screenshot: movie.screenshot,
            nextUpdate: nextUpdate.format(),
            timeInfo: {
                currentParis: parisTime.format('HH:mm'),
                nextChange: nextUpdate.format('YYYY-MM-DD HH:mm'),
                minutesRemaining: nextUpdate.diff(parisTime, 'minutes')
            }
        });
    } catch (error) {
        console.error('Error in daily-movie route:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.get('/api/check-user', apiLimiter, async (req, res) => {
    try {
        const { address } = req.query;
        if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
            return res.status(400).json({ message: 'Invalid Solana address format' });
        }

        const user = await User.findOne({ solanaAddress: address })
            .select('-verificationToken -verificationExpires')
            .lean();
            
        res.json({ exists: !!user, user });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/check-participation', apiLimiter, verifyToken, async (req, res) => {
    const { solanaAddress } = req.query;
    const adminCode = req.query.adminCode;
    const testMode = req.query.testMode === 'true';
    
    if (process.env.ADMIN_CODE && adminCode === process.env.ADMIN_CODE || testMode) {
        return res.json({ hasParticipated: false });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    try {
        const user = await User.findOne({
            solanaAddress,
            lastParticipation: { $gte: today }
        }).select('email solanaAddress').lean();
        
        res.json({ 
            hasParticipated: !!user,
            userInfo: user
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/submit-user', submissionLimiter, async (req, res) => {
    try {
        const { email, solanaAddress } = req.body;
        const adminCode = req.headers['admin-code'];
        const testMode = req.headers['test-mode'] === 'true';

        // Validation des entrées
        if (!solanaAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solanaAddress)) {
            return res.status(400).json({ 
                message: 'Invalid Solana address',
                error: 'INVALID_SOLANA_ADDRESS'
            });
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                message: 'Invalid email format',
                error: 'INVALID_EMAIL'
            });
        }

        let user = await User.findOne({ solanaAddress });

        if (user) {
            user.email = email;
            user.lastParticipation = new Date();
            await user.save();
            
            const token = jwt.sign(
                { userId: user._id, solanaAddress },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );
            req.session.token = token;
            
            return res.json({ 
                message: 'Participation recorded successfully!',
                token
            });
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

        const token = jwt.sign(
            { userId: user._id, solanaAddress },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        req.session.token = token;

        if (!user.isEmailVerified) {
            const verificationLink = `${process.env.BACKEND_URL}/verify-email/${verificationToken}`;
            
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
                requiresVerification: true,
                token
            });
        }

        res.json({ 
            message: 'Registration successful!',
            token
        });

    } catch (error) {
        console.error('Save error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/increment-score', verifyToken, async (req, res) => {
    try {
        const { solanaAddress, movieTitle } = req.body;
        
        if (!solanaAddress || !movieTitle) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const user = await User.findOne({ solanaAddress });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.solvedMovies.includes(movieTitle)) {
            user.correctAnswers += 1;
            user.solvedMovies.push(movieTitle);
            await user.save();

            return res.json({ 
                message: 'Score updated successfully',
                newScore: user.correctAnswers,
                solvedMovies: user.solvedMovies
            });
        }

        res.json({ 
            message: 'Movie already solved',
            newScore: user.correctAnswers,
            solvedMovies: user.solvedMovies
        });
    } catch (error) {
        console.error('Update score error:', error);
        res.status(500).json({ message: 'Server error' });
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
        console.error('Error verifying email:', error);
        res.status(500).send('Error verifying email.');
    }
});

// Route de vérification du token
app.post('/api/verify-token', verifyToken, (req, res) => {
    res.json({ valid: true });
});

// Middleware de gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    // Ne pas exposer les détails de l'erreur en production
    const message = process.env.NODE_ENV === 'production' 
        ? 'Something broke!'
        : err.message;
        
    res.status(500).json({ 
        error: message,
        // Inclure l'ID de trace uniquement en développement
        trace: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Middleware pour les routes non trouvées
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Configuration du serveur HTTPS en production
if (process.env.NODE_ENV === 'production') {
    const fs = require('fs');
    const https = require('https');
    
    const privateKey = fs.readFileSync('/etc/letsencrypt/live/moviegoers-cats.com/privkey.pem', 'utf8');
    const certificate = fs.readFileSync('/etc/letsencrypt/live/moviegoers-cats.com/cert.pem', 'utf8');
    const ca = fs.readFileSync('/etc/letsencrypt/live/moviegoers-cats.com/chain.pem', 'utf8');

    const credentials = {
        key: privateKey,
        cert: certificate,
        ca: ca
    };

    const httpsServer = https.createServer(credentials, app);
    const HTTPS_PORT = process.env.HTTPS_PORT || 443;
    
    httpsServer.listen(HTTPS_PORT, () => {
        console.log(`HTTPS Server running on port ${HTTPS_PORT}`);
    });
} else {
    // Configuration du serveur en développement
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// Gestion propre de l'arrêt du serveur
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});