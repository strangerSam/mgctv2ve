class SolanaWalletManager {
    constructor() {
        this.provider = null;
        this.publicKey = null;
        this.disconnectTimer = null;
        this.DISCONNECT_TIMEOUT = 10 * 60 * 1000; // 10 minutes en millisecondes
        this.init();
    }

    async init() {
        if (typeof window.solana !== 'undefined') {
            this.provider = window.solana;
            console.log('Phantom wallet found!');
            
            try {
                // Vérifier si le wallet est déjà connecté à la page
                const isPhantomConnected = this.provider.isConnected;
                const autoConnectAllowed = localStorage.getItem('wallet-autoconnect') === 'true';
                
                if (isPhantomConnected && autoConnectAllowed) {
                    // Si le wallet est déjà connecté, récupérer directement la clé publique
                    this.publicKey = this.provider.publicKey.toString();
                    this.updateWalletButton();
                    this.startDisconnectTimer();
                    // Dispatcher l'événement de connexion
                    window.dispatchEvent(new Event('wallet-connected'));
                } else if (autoConnectAllowed) {
                    // Sinon, essayer de se connecter automatiquement
                    try {
                        const resp = await this.provider.connect({ onlyIfTrusted: true });
                        this.publicKey = resp.publicKey.toString();
                        this.updateWalletButton();
                        this.startDisconnectTimer();
                        window.dispatchEvent(new Event('wallet-connected'));
                    } catch (error) {
                        console.log('Auto-connection failed, user needs to connect manually');
                        localStorage.removeItem('wallet-autoconnect');
                    }
                }
            } catch (err) {
                console.log('Connection check failed:', err);
                localStorage.removeItem('wallet-autoconnect');
            }

            this.addWalletButton();
            this.setupActivityListeners();
        } else {
            console.log('Phantom wallet not found! Please install it.');
            this.addPhantomInstallButton();
        }
    }

    setupActivityListeners() {
        // Liste des événements à surveiller pour réinitialiser le timer
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        
        events.forEach(event => {
            document.addEventListener(event, () => {
                if (this.publicKey) {
                    this.resetDisconnectTimer();
                }
            });
        });
    }

    startDisconnectTimer() {
        if (this.disconnectTimer) {
            clearTimeout(this.disconnectTimer);
        }
        
        this.disconnectTimer = setTimeout(() => {
            if (this.publicKey) {
                console.log('Auto-disconnecting due to inactivity');
                this.disconnectWallet();
            }
        }, this.DISCONNECT_TIMEOUT);
    }

    resetDisconnectTimer() {
        if (this.disconnectTimer) {
            clearTimeout(this.disconnectTimer);
            this.startDisconnectTimer();
        }
    }

    async connectWallet() {
        try {
            const resp = await this.provider.connect();
            this.publicKey = resp.publicKey.toString();
            localStorage.setItem('wallet-autoconnect', 'true');
            this.updateWalletButton();
            this.startDisconnectTimer();
            
            await checkMovieStatus();
            
            return true;
        } catch (err) {
            console.error('Error connecting to wallet:', err);
            return false;
        }
    }

    async disconnectWallet() {
        try {
            await this.provider.disconnect();
            this.publicKey = null;
            localStorage.removeItem('wallet-autoconnect');
            this.updateWalletButton();
            
            if (this.disconnectTimer) {
                clearTimeout(this.disconnectTimer);
                this.disconnectTimer = null;
            }
        } catch (err) {
            console.error('Error disconnecting wallet:', err);
        }
    }

    updateWalletButton() {
        const button = document.querySelector('.wallet-button');
        if (button) {
            button.innerHTML = this.publicKey 
                ? `Connected: ${this.publicKey.slice(0, 4)}...${this.publicKey.slice(-4)}`
                : 'Connect Wallet';
        }
    }

    addWalletButton() {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'wallet-button-container';
        
        const connectButton = document.createElement('button');
        connectButton.className = 'wallet-button';
        connectButton.innerHTML = this.publicKey 
            ? `Connected: ${this.publicKey.slice(0, 4)}...${this.publicKey.slice(-4)}`
            : 'Connect Wallet';
        
        connectButton.onclick = async () => {
            if (!this.publicKey) {
                await this.connectWallet();
            } else {
                await this.disconnectWallet();
            }
        };

        // Gérer les événements de connexion/déconnexion
        this.provider.on('connect', (publicKey) => {
            this.publicKey = publicKey.toString();
            this.updateWalletButton();
            localStorage.setItem('wallet-autoconnect', 'true');
        });

        this.provider.on('disconnect', () => {
            this.publicKey = null;
            this.updateWalletButton();
            localStorage.removeItem('wallet-autoconnect');
        });

        buttonContainer.appendChild(connectButton);
        document.querySelector('.nav-links').appendChild(buttonContainer);
    }

    addPhantomInstallButton() {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'wallet-button-container';
        
        const installButton = document.createElement('button');
        installButton.className = 'wallet-button';
        installButton.innerHTML = 'Install Phantom Wallet';
        installButton.onclick = () => {
            window.open('https://phantom.app/', '_blank');
        };

        buttonContainer.appendChild(installButton);
        document.querySelector('.nav-links').appendChild(buttonContainer);
    }

    onWalletConnected(publicKey) {
        console.log('Wallet connected:', publicKey);
        // Ici, vous pouvez ajouter la logique pour mettre à jour l'interface
        // ou vérifier l'existence de l'utilisateur dans votre base de données
    }

    onWalletDisconnected() {
        console.log('Wallet disconnected');
        // Ici, vous pouvez ajouter la logique pour réinitialiser l'interface
    }
}

// Initialiser le gestionnaire de wallet au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    window.walletManager = new SolanaWalletManager();
});