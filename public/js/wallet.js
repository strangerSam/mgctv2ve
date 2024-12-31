// public/js/wallet.js

class SolanaWalletManager {
    constructor() {
        this.provider = null;
        this.publicKey = null;
        this.init();
    }

    async init() {
        // Attendre que Phantom soit injecté
        if (typeof window.solana !== 'undefined') {
            this.provider = window.solana;
            console.log('Phantom wallet found!');
            this.addWalletButton();
        } else {
            console.log('Phantom wallet not found! Please install it.');
            this.addPhantomInstallButton();
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
                try {
                    // Demander à l'utilisateur de connecter son wallet
                    const resp = await this.provider.connect();
                    this.publicKey = resp.publicKey.toString();
                    connectButton.innerHTML = `Connected: ${this.publicKey.slice(0, 4)}...${this.publicKey.slice(-4)}`;
                    this.onWalletConnected(this.publicKey);
                } catch (err) {
                    console.error('Error connecting to wallet:', err);
                }
            } else {
                // Déconnexion
                await this.provider.disconnect();
                this.publicKey = null;
                connectButton.innerHTML = 'Connect Wallet';
                this.onWalletDisconnected();
            }
        };

        // Gérer les événements de connexion/déconnexion
        this.provider.on('connect', (publicKey) => {
            this.publicKey = publicKey.toString();
            connectButton.innerHTML = `Connected: ${this.publicKey.slice(0, 4)}...${this.publicKey.slice(-4)}`;
            this.onWalletConnected(this.publicKey);
        });

        this.provider.on('disconnect', () => {
            this.publicKey = null;
            connectButton.innerHTML = 'Connect Wallet';
            this.onWalletDisconnected();
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