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
                    this.publicKey = this.provider.publicKey.toString();
                    this.updateWalletButton();
                    this.startDisconnectTimer();
                    window.dispatchEvent(new Event('wallet-connected'));
                }

                this.addWalletButton();
                this.setupActivityListeners();
                
            } catch (err) {
                console.log('Connection check failed:', err);
                localStorage.removeItem('wallet-autoconnect');
            }
        } else {
            console.log('Phantom wallet not found!');
            this.addPhantomInstallButton();
        }
    }

    async connectWallet() {
        try {
            const resp = await this.provider.connect();
            this.publicKey = resp.publicKey.toString();
            localStorage.setItem('wallet-autoconnect', 'true');
            this.updateWalletButton();
            this.startDisconnectTimer();
            
            // S'assurer que l'événement est émis après que tout est configuré
            window.dispatchEvent(new Event('wallet-connected'));
            
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
            
            window.dispatchEvent(new Event('wallet-disconnected'));
        } catch (err) {
            console.error('Error disconnecting wallet:', err);
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

        // Supprimer les anciens écouteurs s'ils existent
        this.provider.removeAllListeners('connect');
        this.provider.removeAllListeners('disconnect');

        // Ajouter les nouveaux écouteurs
        this.provider.on('connect', (publicKey) => {
            if (publicKey) {
                this.publicKey = publicKey.toString();
                this.updateWalletButton();
                this.startDisconnectTimer();
                window.dispatchEvent(new Event('wallet-connected'));
            }
        });

        this.provider.on('disconnect', () => {
            this.publicKey = null;
            this.updateWalletButton();
            if (this.disconnectTimer) {
                clearTimeout(this.disconnectTimer);
                this.disconnectTimer = null;
            }
            window.dispatchEvent(new Event('wallet-disconnected'));
        });

        buttonContainer.appendChild(connectButton);
        document.querySelector('.nav-links').appendChild(buttonContainer);
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
    
        // Gérer les événements de connexion/déconnexion du Phantom wallet lui-même
        this.provider.on('connect', () => {
            this.updateWalletButton();
            window.dispatchEvent(new Event('wallet-connected'));
            this.startDisconnectTimer();
        });
    
        this.provider.on('disconnect', () => {
            this.publicKey = null;
            this.updateWalletButton();
            window.dispatchEvent(new Event('wallet-disconnected'));
            if (this.disconnectTimer) {
                clearTimeout(this.disconnectTimer);
                this.disconnectTimer = null;
            }
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