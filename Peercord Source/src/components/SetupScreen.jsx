import React, { useState, useEffect, useRef } from 'react';
import { generateIdentitySeed, network } from '../p2p/index.js';
import logo from '../../assets/icon.png';

export default function SetupScreen({ setProfile }) {
  const [view, setView] = useState('saved'); 
  const [savedAccounts, setSavedAccounts] = useState([]);
  
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [seedHex, setSeedHex] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [seedAcknowledged, setSeedAcknowledged] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    const accounts = JSON.parse(localStorage.getItem('pear_saved_accounts') || '[]');
    setSavedAccounts(accounts);
    if (accounts.length === 0) setView('signup');
  },[]);

  const saveAccountToStorage = (profile) => {
    const accounts = JSON.parse(localStorage.getItem('pear_saved_accounts') || '[]');
    const existingIndex = accounts.findIndex(a => a.seedHex === profile.seedHex);
    if (existingIndex >= 0) {
      accounts[existingIndex] = profile;
    } else {
      accounts.push(profile);
    }
    localStorage.setItem('pear_saved_accounts', JSON.stringify(accounts));
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!displayName.trim() || !username.trim() || !seedAcknowledged) return;
    
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (!cleanUsername) return alert("Invalid username. Use only letters, numbers, underscores, and periods.");

    setIsChecking(true);
    try {
      const isAvailable = await network.checkUsernameAvailable(cleanUsername);
      if (!isAvailable) {
        alert("This username is currently in use by an online peer. Please choose another one.");
        setIsChecking(false);
        return;
      }
    } catch (err) {
      console.error("Username check failed:", err);
    }
    setIsChecking(false);

    const newSeedHex = generateIdentitySeed();
    const profile = { displayName: displayName.trim(), username: cleanUsername, seedHex: newSeedHex, avatar: null };

    saveAccountToStorage(profile);
    localStorage.setItem('pear_discord_identity', JSON.stringify(profile));
    setProfile(profile);
  };

  const handleSeedRestore = async (e) => {
    e.preventDefault();
    if (!seedHex.trim()) return;

    setIsChecking(true);
    setSyncStatus('Looking for your online devices...');

    try {
      const b4a = window.require('b4a');
      const sodium = window.require('sodium-native');
      const Hyperswarm = window.require('hyperswarm');

      const seedBuf = b4a.from(seedHex.trim(), 'hex');
      const realPubKey = b4a.alloc(32);
      const realSecKey = b4a.alloc(64);
      sodium.crypto_sign_seed_keypair(realPubKey, realSecKey, seedBuf);
      const realPubKeyHex = b4a.toString(realPubKey, 'hex');

      // FIX: Added ephemeral: true to prevent this background swarm from exhausting the router NAT table
      const tempSwarm = new Hyperswarm({ ephemeral: true });
      const syncTopic = b4a.alloc(32);
      sodium.crypto_generichash(syncTopic, b4a.from('peercord-sync:' + realPubKeyHex));

      let synced = false;

      tempSwarm.on('connection', (conn) => {
        const tempKeyHex = b4a.toString(tempSwarm.keyPair.publicKey, 'hex');
        const msgBuf = b4a.from('sync-request:' + tempKeyHex);
        const sigBuf = b4a.alloc(sodium.crypto_sign_BYTES);
        sodium.crypto_sign_detached(sigBuf, msgBuf, realSecKey);

        const Protomux = window.require('protomux');
        const cenc = window.require('compact-encoding');
        
        const mux = Protomux.from(conn);
        const channel = mux.createChannel({ protocol: 'peercord/app' });
        if (!channel) return;

        const appEncoding = {
          preencode(state, m) { cenc.string.preencode(state, JSON.stringify(m)); },
          encode(state, m) { cenc.string.encode(state, JSON.stringify(m)); },
          decode(state) { return JSON.parse(cenc.string.decode(state)); }
        };

        const appMessage = channel.addMessage({
          encoding: appEncoding,
          onmessage: async (msg) => {
            if (msg.type === 'ephemeral' && msg.payload?.type === 'account_sync_reply' && msg.payload.data) {
              setSyncStatus('Syncing data...');
              const importedProfile = await network.importAccount(msg.payload.data);
              synced = true;
              tempSwarm.destroy();
              
              saveAccountToStorage(importedProfile);
              localStorage.setItem('pear_discord_identity', JSON.stringify(importedProfile));
              setProfile(importedProfile);
            }
          }
        });

        channel.open();
        
        try {
          appMessage.send({
            type: 'ephemeral',
            payload: {
              type: 'account_sync_request',
              tempKey: tempKeyHex,
              signature: b4a.toString(sigBuf, 'hex')
            }
          });
        } catch (e) {}
      });

      tempSwarm.join(syncTopic, { client: true, server: false });

      setTimeout(() => {
        if (!synced) {
          tempSwarm.destroy();
          setIsChecking(false);
          setSyncStatus('');
          alert("Could not find any of your devices online to sync from.\n\nPlease ensure your other device is open and connected to the internet, or use a Backup File (.json) instead.");
        }
      }, 15000);

    } catch (err) {
      console.error(err);
      setIsChecking(false);
      setSyncStatus('');
      alert("Invalid seed or network error.");
    }
  };

  const handleSavedLogin = (profile) => {
    localStorage.setItem('pear_discord_identity', JSON.stringify(profile));
    setProfile(profile);
  };

  const handleImportAccount = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonString = event.target.result;
        const importedProfile = await network.importAccount(jsonString);
        
        saveAccountToStorage(importedProfile);
        localStorage.setItem('pear_discord_identity', JSON.stringify(importedProfile));
        setProfile(importedProfile);
      } catch (err) {
        alert("Failed to import account. The backup file may be corrupted or invalid.");
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-base font-sans">
      <div className="bg-surface p-8 rounded-lg shadow-xl w-96 flex flex-col items-center border border-panel">
        <img src={logo} alt="Logo" className="w-16 h-16 rounded-md mb-6 shadow-lg object-cover" />
        
        {view === 'saved' && (
          <div className="w-full">
            <h1 className="text-2xl font-bold text-text mb-2 text-center">Welcome Back</h1>
            <p className="text-muted text-sm text-center mb-6">Select an account to log in.</p>
            
            <div className="space-y-2 mb-6 max-h-48 overflow-y-auto custom-scrollbar pr-2">
              {savedAccounts.map((acc, i) => (
                <div 
                  key={i} 
                  onClick={() => handleSavedLogin(acc)}
                  className="flex items-center gap-3 p-3 bg-panel hover:bg-base rounded cursor-pointer transition-colors border border-surface"
                >
                  <div className="w-10 h-10 rounded-md bg-indigo-500 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
                    {acc.avatar ? <img src={acc.avatar} className="w-full h-full object-cover" /> : acc.displayName.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-text font-bold truncate">{acc.displayName}</span>
                    <span className="text-xs text-muted truncate">@{acc.username}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <button onClick={() => setView('signup')} className="w-full bg-accent hover:opacity-90 text-white font-bold py-2.5 rounded transition-opacity">
                Create New Account
              </button>
              <button onClick={() => setView('login')} className="w-full bg-panel hover:bg-base text-text font-bold py-2.5 rounded transition-colors border border-surface">
                Restore Account from Seed
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="w-full bg-transparent hover:underline text-muted font-bold py-2.5 rounded transition-colors text-sm mt-2">
                Restore from Backup File
              </button>
              <input type="file" accept=".json" ref={fileInputRef} onChange={handleImportAccount} className="hidden" />
            </div>
          </div>
        )}

        {view === 'signup' && (
          <form onSubmit={handleSignup} className="w-full">
            <h1 className="text-2xl font-bold text-text mb-2 text-center">Create Account</h1>
            <p className="text-muted text-sm text-center mb-6">Your cryptographic identity will be generated automatically.</p>

            <div className="mb-4">
              <label className="block text-xs font-bold text-muted uppercase mb-2">Display Name</label>
              <input 
                type="text" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-panel text-text rounded p-3 outline-none focus:ring-2 focus:ring-accent"
                placeholder="e.g. Satoshi"
                maxLength={24}
                disabled={isChecking}
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-muted uppercase mb-2">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                className="w-full bg-panel text-text rounded p-3 outline-none focus:ring-2 focus:ring-accent"
                placeholder="e.g. satoshi_nakamoto"
                maxLength={24}
                disabled={isChecking}
              />
            </div>

            <div className="mb-6 flex items-start gap-2 bg-red-500/10 p-3 rounded border border-red-500/30">
              <input 
                type="checkbox" 
                checked={seedAcknowledged} 
                onChange={e => setSeedAcknowledged(e.target.checked)} 
                className="mt-1 accent-red-500 cursor-pointer shrink-0" 
              />
              <span className="text-xs text-red-400 leading-tight">
                I understand that my Account Seed is the ONLY way to recover my account. If I lose it, I lose my account forever.
              </span>
            </div>

            <button type="submit" disabled={isChecking || !seedAcknowledged} className="w-full bg-accent hover:opacity-90 text-white font-bold py-3 rounded transition-opacity disabled:opacity-50 flex justify-center items-center gap-2">
              {isChecking ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Checking Username...
                </>
              ) : (
                'Create Identity & Join'
              )}
            </button>
            
            <div className="mt-4 flex justify-between text-sm">
              <button type="button" onClick={() => setView('login')} className="text-accent hover:underline">Have a seed?</button>
              {savedAccounts.length > 0 && <button type="button" onClick={() => setView('saved')} className="text-muted hover:underline">Saved Accounts</button>}
            </div>
          </form>
        )}

        {view === 'login' && (
          <form onSubmit={handleSeedRestore} className="w-full">
            <h1 className="text-2xl font-bold text-text mb-2 text-center">Restore Account</h1>
            <p className="text-muted text-sm text-center mb-6">Paste your 64-character private key to securely sync your account from another online device.</p>

            <div className="mb-6">
              <label className="block text-xs font-bold text-muted uppercase mb-2">Account Seed (Private Key)</label>
              <input 
                type="password" 
                value={seedHex}
                onChange={(e) => setSeedHex(e.target.value)}
                disabled={isChecking}
                className="w-full bg-panel text-text rounded p-3 outline-none focus:ring-2 focus:ring-accent font-mono text-sm disabled:opacity-50"
                placeholder="Paste 64-character hex seed..."
              />
            </div>
            
            <button type="submit" disabled={isChecking || !seedHex.trim()} className="w-full bg-accent hover:opacity-90 text-white font-bold py-3 rounded transition-opacity disabled:opacity-50 flex justify-center items-center gap-2">
              {isChecking ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  {syncStatus}
                </>
              ) : (
                'Sync & Login'
              )}
            </button>
            
            <div className="mt-4 flex justify-between text-sm">
              <button type="button" onClick={() => setView('signup')} disabled={isChecking} className="text-accent hover:underline disabled:opacity-50">Create Account</button>
              {savedAccounts.length > 0 && <button type="button" onClick={() => setView('saved')} disabled={isChecking} className="text-muted hover:underline disabled:opacity-50">Saved Accounts</button>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}