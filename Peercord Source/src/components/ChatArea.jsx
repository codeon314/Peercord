import React, { useState, useRef, useEffect, useMemo } from 'react';
import { network, ADMIN_PUBLIC_KEY } from '../p2p/index.js';
import ServerInviteCard from './ServerInviteCard.jsx';
import UserProfileModal from './UserProfileModal.jsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const QUICK_EMOJIS = ['❤️', '😂', '💯', '🔥'];
const ALL_EMOJIS = ['😀','😂','🤣','😊','😍','🥰','😎','🤩','😘','😗','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','👌','🤏','👈','👉','👆','👇','☝️','✋','🤚','🖐','🖖','👋','🤙','💪','🦾','🖕','✍️','🙏','🦶','🦵','🦿','💄','💋','👄','🦷','👅','👂','🦻','👃','👣','👁','👀','🧠','🗣','👤','👥','💯','💢','💥','💫','💦','💨','🕳','💣','💬','👁️‍🗨️','🗨️','🗯️','💭','💤'];

const MarkdownComponents = {
  code({node, inline, className, children, ...props}) {
    const match = /language-(\w+)/.exec(className || '')
    return !inline && match ? (
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={match[1]}
        PreTag="div"
        className="rounded-md !my-2 !bg-base border border-surface text-sm custom-scrollbar"
        {...props}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    ) : (
      <code className="bg-base text-text px-1.5 py-0.5 rounded font-mono text-[13px] before:content-none after:content-none" {...props}>
        {children}
      </code>
    )
  },
  a: ({node, href, children, ...props}) => {
    if (href && href.startsWith('mention://')) {
      return <span className="bg-[#5865F2]/30 !text-[#c9cdfb] hover:bg-[#5865F2] hover:!text-white px-1.5 py-0.5 rounded-md font-medium cursor-pointer transition-colors no-underline">{children}</span>;
    }
    if (href && href.startsWith('channel://')) {
      return <span className="bg-[#5865F2]/30 !text-[#c9cdfb] hover:bg-[#5865F2] hover:!text-white px-1.5 py-0.5 rounded-md font-medium cursor-pointer transition-colors no-underline">{children}</span>;
    }
    return <a className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer" href={href} {...props}>{children}</a>;
  },
  p: ({node, children, ...props}) => <p className="mb-2 last:mb-0 whitespace-pre-wrap" {...props}>{children}</p>
};

const processMentionsAndChannels = (text) => {
  if (!text) return '';
  let processed = text.replace(/(^|\s)(@everyone|@[a-zA-Z0-9_.]+)/g, '$1[**$2**](mention://$2)');
  processed = processed.replace(/(^|\s)(#[a-z0-9-]+)/g, '$1[**$2**](channel://$2)');
  return processed;
};

const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes =['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const DECRYPTION_INITIAL_DELAY_MS = 400; 
const DECRYPTION_SPEED_MS = 30;          
const DECRYPTION_CHARS_PER_TICK = 1;     

const DecryptedMessage = ({ msg, liveDecryption, animationTrigger, components }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [gibberish, setGibberish] = useState('');
  const lastTrigger = useRef(animationTrigger);

  useEffect(() => {
    if (!liveDecryption || !msg.isEncrypted || !msg.text) {
      setIsAnimating(false);
      return;
    }

    const isNewTrigger = animationTrigger !== lastTrigger.current;
    lastTrigger.current = animationTrigger;

    const cacheKey = `animated_${msg.id}`;
    if (!isNewTrigger && sessionStorage.getItem(cacheKey)) {
      setIsAnimating(false);
      return;
    }
    
    sessionStorage.setItem(cacheKey, 'true');

    const text = msg.text;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let gib = '';
    let seed = 0;
    const cipher = msg.cipher || 'fallback';
    for(let i=0; i<cipher.length; i++) seed += cipher.charCodeAt(i);
    
    for(let i=0; i<text.length; i++) {
       const rand = Math.abs(Math.sin(seed + i) * 10000);
       gib += chars[Math.floor(rand * chars.length) % chars.length];
    }
    
    setGibberish(gib);
    setRevealed(0);
    setIsAnimating(true);

    let curr = 0;
    let interval;

    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        curr += DECRYPTION_CHARS_PER_TICK;
        if (curr >= text.length) {
          setRevealed(text.length);
          setIsAnimating(false);
          clearInterval(interval);
        } else {
          setRevealed(curr);
        }
      }, DECRYPTION_SPEED_MS);
    }, DECRYPTION_INITIAL_DELAY_MS);
    
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [msg.text, msg.cipher, msg.isEncrypted, liveDecryption, msg.id, animationTrigger]);

  if (!isAnimating) {
    return (
      <div className="prose prose-invert max-w-none text-[15px] prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent prose-a:text-blue-400 hover:prose-a:text-blue-300 prose-img:rounded-md prose-img:max-h-96 prose-img:object-contain prose-headings:my-2 prose-h1:text-2xl prose-h1:font-bold prose-h2:text-xl prose-h2:font-bold prose-h3:text-lg prose-h3:font-bold prose-ul:my-1 prose-ol:my-1 prose-li:my-0 break-words">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm, remarkBreaks]} 
          components={components || MarkdownComponents}
          urlTransform={(value) => value}
        >
          {processMentionsAndChannels(msg.text || '')}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="font-mono text-[15px] whitespace-pre-wrap break-words leading-relaxed">
      <span>{msg.text.substring(0, revealed)}</span>
      <span className="bg-green-500/20 text-green-400 rounded px-0.5">{gibberish.substring(revealed)}</span>
    </div>
  );
};

export default function ChatArea({ activeView, activeChannel, setActiveChannel, messages, myKey, profile, typingUsers, readReceipts, deliveredReceipts, onlinePeers, markChannelRead, dms, servers, onStartCall, activeCall, onReturnToCall, transfers, onOpenInvite, onToggleMembers, pinMembers, onNavigateToDM }) {
  const[inputText, setInputText] = useState('');
  const[editingId, setEditingId] = useState(null);
  const[editInput, setEditInput] = useState('');
  const[activeTypers, setActiveTypers] = useState([]);
  const[replyingTo, setReplyingTo] = useState(null);
  
  const [attachments, setAttachments] = useState([]);
  const[isDragging, setIsDragging] = useState(false);
  const[expandedImage, setExpandedImage] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [fullEmojiPicker, setFullEmojiPicker] = useState(null);
  const [emojiPickerDirection, setEmojiPickerDirection] = useState('down');
  const [profileViewUser, setProfileViewUser] = useState(null);
  
  const [mentionType, setMentionType] = useState(null); // 'user' | 'channel'
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [filteredMentions, setFilteredMentions] = useState([]);

  const [showCrypto, setShowCrypto] = useState(false);
  const [liveDecryption, setLiveDecryption] = useState(localStorage.getItem('pear_live_decryption') === 'true');
  const [ircMode, setIrcMode] = useState(localStorage.getItem('pear_irc_mode') === 'true');
  const [animationTrigger, setAnimationTrigger] = useState(0);
  
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const editTextareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastTypingTime = useRef(0);
  const lastSentReadIdRef = useRef(null);

  const isDMView = activeView === 'dms';
  const gcObj = isDMView ? servers.find(s => s.topicHex === activeChannel && s.isGroupChat) : null;
  const isGroupChat = !!gcObj;
  
  const networkChannelId = isGroupChat ? activeChannel : (isDMView ? activeChannel : `${activeView}-${activeChannel}`);

  let isAdmin = myKey === ADMIN_PUBLIC_KEY;
  let canPost = true;
  let canUpload = true;
  let canReact = true;
  
  if (!isDMView || isGroupChat) {
    const activeServerObj = servers.find(s => s.topicHex === (isGroupChat ? activeChannel : activeView));
    if (activeServerObj) {
      if (activeServerObj.owner === myKey) {
        isAdmin = true;
      }
      
      if (!isAdmin) {
        const userRoles = activeServerObj.memberRoles?.[myKey] || [];
        const isServerAdmin = userRoles.some(rId => {
          const r = activeServerObj.roles?.find(role => role.id === rId);
          return r && r.permissions.includes('admin');
        });

        if (!isServerAdmin) {
          const channelPerms = activeServerObj.channels?.permissions?.[activeChannel];
          
          if (channelPerms && channelPerms.length > 0) {
            const hasChannelAccess = userRoles.some(rId => channelPerms.includes(rId));
            if (!hasChannelAccess) {
              canPost = false;
              canUpload = false;
              canReact = false;
            }
          }
          
          const channelSendPerms = activeServerObj.channels?.send_permissions?.[activeChannel];
          if (channelSendPerms && channelSendPerms.length > 0) {
            const hasChannelSendAccess = userRoles.some(rId => channelSendPerms.includes(rId));
            if (!hasChannelSendAccess) {
              canPost = false;
              canUpload = false;
            }
          }

          if (canPost) {
            const hasSendPerm = userRoles.some(rId => {
              const r = activeServerObj.roles?.find(role => role.id === rId);
              return r && r.permissions.includes('send_messages');
            });
            if (!hasSendPerm && activeServerObj.roles && activeServerObj.roles.length > 0) canPost = false;
          }

          if (canUpload) {
            const hasFilePerm = userRoles.some(rId => {
              const r = activeServerObj.roles?.find(role => role.id === rId);
              return r && r.permissions.includes('send_files');
            });
            if (!hasFilePerm && activeServerObj.roles && activeServerObj.roles.length > 0) canUpload = false;
          }
          
          if (canReact) {
            const hasReactPerm = userRoles.some(rId => {
              const r = activeServerObj.roles?.find(role => role.id === rId);
              return r && r.permissions.includes('add_reactions');
            });
            if (!hasReactPerm && activeServerObj.roles && activeServerObj.roles.length > 0) canReact = false;
          }
        }
      }
    }
  }

  const openProfile = (pubKey) => {
    const user = network.knownProfiles.get(pubKey) || { key: pubKey, displayName: 'Unknown User', username: 'unknown' };
    setProfileViewUser({ key: pubKey, ...user });
  };

  const markdownComponents = useMemo(() => ({
    code({node, inline, className, children, ...props}) {
      const match = /language-(\w+)/.exec(className || '')
      return !inline && match ? (
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={match[1]}
          PreTag="div"
          className="rounded-md !my-2 !bg-base border border-surface text-sm custom-scrollbar"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className="bg-base text-text px-1.5 py-0.5 rounded font-mono text-[13px] before:content-none after:content-none" {...props}>
          {children}
        </code>
      )
    },
    a: ({node, href, children, ...props}) => {
      if (href && href.startsWith('mention://')) {
        return (
          <span 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const username = href.replace('mention://@', '');
              if (username === 'everyone') return;
              
              let foundPubKey = null;
              for (const [key, profile] of network.knownProfiles.entries()) {
                if (profile.username === username) {
                  foundPubKey = key;
                  break;
                }
              }
              
              if (foundPubKey) {
                openProfile(foundPubKey);
              } else {
                const dirUser = network.userDirectory?.get(username);
                if (dirUser && dirUser.pubKey) openProfile(dirUser.pubKey);
                else openProfile(username); 
              }
            }}
            className="bg-[#5865F2]/30 !text-[#c9cdfb] hover:bg-[#5865F2] hover:!text-white px-1.5 py-0.5 rounded-md font-medium cursor-pointer transition-colors no-underline"
          >
            {children}
          </span>
        );
      }
      if (href && href.startsWith('channel://')) {
        return (
          <span 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const channelName = href.replace('channel://#', '');
              if (setActiveChannel) setActiveChannel(channelName);
            }}
            className="bg-[#5865F2]/30 !text-[#c9cdfb] hover:bg-[#5865F2] hover:!text-white px-1.5 py-0.5 rounded-md font-medium cursor-pointer transition-colors no-underline"
          >
            {children}
          </span>
        );
      }
      return <a className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer" href={href} {...props}>{children}</a>;
    },
    p: ({node, children, ...props}) => <p className="mb-2 last:mb-0 whitespace-pre-wrap" {...props}>{children}</p>
  }), [setActiveChannel]);

  useEffect(() => {
    const handleStorage = () => {
      setIrcMode(localStorage.getItem('pear_irc_mode') === 'true');
      setLiveDecryption(localStorage.getItem('pear_live_decryption') === 'true');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    setReplyingTo(null);
    setMentionQuery(null);
    setMentionType(null);
    setInputText('');
    setAttachments([]);
    setEditingId(null);
  },[activeChannel, activeView]);

  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setFullEmojiPicker(null);
    };
    if (contextMenu || fullEmojiPicker) document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu, fullEmojiPicker]);

  useEffect(() => {
    const handleJump = (e) => {
      const msgId = e.detail;
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('bg-accent/20');
        setTimeout(() => el.classList.remove('bg-accent/20'), 2000);
      }
    };
    window.addEventListener('jump-to-message', handleJump);
    return () => window.removeEventListener('jump-to-message', handleJump);
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
    
    const sendRead = () => {
      const currentChannelMessages = messages.filter(m => {
        if (isDMView && !isGroupChat) return (m.sender === myKey && m.recipient === activeChannel) || (m.sender === activeChannel && m.recipient === myKey);
        return m.channel === networkChannelId && !m.recipient;
      });
      
      const latestMsg = currentChannelMessages[currentChannelMessages.length - 1];
      const latestMsgId = latestMsg ? latestMsg.id : null;
      
      if (latestMsgId && latestMsgId !== lastSentReadIdRef.current) {
        network.sendReadReceipt(networkChannelId, latestMsgId);
        lastSentReadIdRef.current = latestMsgId;
      }
      markChannelRead(networkChannelId);
    };

    sendRead();
    const interval = setInterval(sendRead, 3000); 
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[messages.length, activeChannel, isDMView, isGroupChat, myKey, onlinePeers.length, activeView]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const typers = Object.entries(typingUsers)
        .filter(([key, info]) => {
          if (now - info.timestamp >= 3000 || key === myKey) return false;
          return (isDMView && !isGroupChat) ? (key === activeChannel && info.channel === myKey) : (info.channel === networkChannelId);
        })
        .map(([_, info]) => info.displayName);
      setActiveTypers(typers);
    }, 1000);
    return () => clearInterval(interval);
  },[typingUsers, activeChannel, myKey, isDMView, isGroupChat, networkChannelId]);

  useEffect(() => {
    if (editingId && editTextareaRef.current) {
      editTextareaRef.current.style.height = 'auto';
      editTextareaRef.current.style.height = `${Math.min(editTextareaRef.current.scrollHeight, 400)}px`;
      editTextareaRef.current.focus();
    }
  },[editingId]);

  useEffect(() => {
    if (mentionQuery !== null) {
      if (mentionType === 'user') {
        let users = [];
        if (isDMView && !isGroupChat) {
          const dmUser = dms[activeChannel]?.profile || { displayName: 'Unknown', username: 'unknown' };
          users = [dmUser];
        } else {
          const serverObj = servers.find(s => s.topicHex === (isGroupChat ? activeChannel : activeView));
          if (serverObj) {
            const members = network.serverMembers[serverObj.topicHex] ? Array.from(network.serverMembers[serverObj.topicHex]) : [];
            if (!members.includes(serverObj.owner)) members.push(serverObj.owner);
            users = members.map(k => network.knownProfiles.get(k)).filter(Boolean);
          }
        }
        
        const query = mentionQuery.toLowerCase();
        const filtered = users.filter(u => u.username.toLowerCase().includes(query) || u.displayName.toLowerCase().includes(query));
        
        let canMentionEveryone = isAdmin;
        if (!isAdmin && !isDMView) {
          const serverObj = servers.find(s => s.topicHex === activeView);
          if (serverObj) {
            const userRoles = serverObj.memberRoles?.[myKey] || [];
            canMentionEveryone = userRoles.some(rId => {
              const r = serverObj.roles?.find(role => role.id === rId);
              return r && (r.permissions.includes('admin') || r.permissions.includes('mention_everyone'));
            });
          }
        }

        if ('everyone'.includes(query) && (canMentionEveryone || isDMView)) {
          filtered.unshift({ username: 'everyone', displayName: 'Everyone in this channel', avatar: null, isSpecial: true });
        }
        
        setFilteredMentions(filtered);
      } else if (mentionType === 'channel') {
        const serverObj = servers.find(s => s.topicHex === activeView);
        if (serverObj && serverObj.channels) {
          const allChannels = [
            ...(serverObj.channels.text || []).map(ch => ({ isChannel: true, name: ch, type: 'text' })),
            ...(serverObj.channels.voice || []).map(ch => ({ isChannel: true, name: ch, type: 'voice' }))
          ];
          const query = mentionQuery.toLowerCase();
          const filtered = allChannels.filter(ch => ch.name.toLowerCase().includes(query));
          setFilteredMentions(filtered);
        } else {
          setFilteredMentions([]);
        }
      }
      setMentionIndex(0);
    }
  }, [mentionQuery, mentionType, activeView, activeChannel, isDMView, isGroupChat, dms, servers, isAdmin, myKey]);

  const processFiles = async (files) => {
    const newAttachments =[];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newAttachments.push({
        name: file.name,
        size: file.size,
        type: file.type,
        path: file.path,
        fileObj: file, 
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      });
    }
    setAttachments(prev =>[...prev, ...newAttachments]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (canUpload && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e) => {
    if (canUpload && e.clipboardData.files && e.clipboardData.files.length > 0) {
      processFiles(e.clipboardData.files);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 400)}px`;
    }

    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    
    const userMatch = textBeforeCursor.match(/(^|\s)@([a-zA-Z0-9_.]*)$/);
    const channelMatch = textBeforeCursor.match(/(^|\s)#([a-z0-9-]*)$/);

    if (userMatch) {
      setMentionType('user');
      setMentionQuery(userMatch[2]);
    } else if (channelMatch && !isDMView) {
      setMentionType('channel');
      setMentionQuery(channelMatch[2]);
    } else {
      setMentionType(null);
      setMentionQuery(null);
    }

    const now = Date.now();
    if (now - lastTypingTime.current > 2000) {
      network.sendTyping(networkChannelId);
      lastTypingTime.current = now;
    }
  };

  const insertMention = (item) => {
    if (!item) return;
    const cursor = textareaRef.current.selectionStart;
    const textBeforeCursor = inputText.slice(0, cursor);
    const textAfterCursor = inputText.slice(cursor);
    
    if (mentionType === 'user') {
      const match = textBeforeCursor.match(/(^|\s)@([a-zA-Z0-9_.]*)$/);
      if (match) {
        const newTextBefore = textBeforeCursor.slice(0, match.index) + match[1] + `@${item.username} `;
        setInputText(newTextBefore + textAfterCursor);
        setMentionQuery(null);
        setMentionType(null);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.selectionStart = newTextBefore.length;
            textareaRef.current.selectionEnd = newTextBefore.length;
          }
        }, 0);
      }
    } else if (mentionType === 'channel') {
      const match = textBeforeCursor.match(/(^|\s)#([a-z0-9-]*)$/);
      if (match) {
        const newTextBefore = textBeforeCursor.slice(0, match.index) + match[1] + `#${item.name} `;
        setInputText(newTextBefore + textAfterCursor);
        setMentionQuery(null);
        setMentionType(null);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.selectionStart = newTextBefore.length;
            textareaRef.current.selectionEnd = newTextBefore.length;
          }
        }, 0);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (mentionQuery !== null && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredMentions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredMentions.length) % filteredMentions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        setMentionType(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      
      const replyId = replyingTo ? replyingTo.id : null;

      if (attachments.length > 0) {
        for (let i = 0; i < attachments.length; i++) {
          const textToSend = i === 0 ? inputText.trim() : '';
          if (isDMView && !isGroupChat) network.sendDMFile(activeChannel, textToSend, attachments[i]);
          else network.sendFile(networkChannelId, textToSend, attachments[i]);
        }
        setAttachments([]);
        setInputText('');
        setReplyingTo(null);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      } else if (inputText.trim() !== '') {
        if (isDMView && !isGroupChat) network.sendDM(activeChannel, inputText.trim(), replyId);
        else network.sendMessage(networkChannelId, inputText.trim(), replyId);
        setInputText('');
        setReplyingTo(null);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }
    }
  };

  const startEditing = (msg) => {
    setEditingId(msg.id);
    setEditInput(msg.text);
  };

  const handleEditChange = (e) => {
    setEditInput(e.target.value);
    if (editTextareaRef.current) {
      editTextareaRef.current.style.height = 'auto';
      editTextareaRef.current.style.height = `${Math.min(editTextareaRef.current.scrollHeight, 400)}px`;
    }
  };

  const handleEditMessage = (e, id) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editInput.trim() !== '') network.sendEditMessage(id, editInput.trim());
      setEditingId(null);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const handleOpenFolder = async (filePath) => {
    if (!filePath) return;
    try {
      if (typeof Pear !== 'undefined') {
        const { spawn } = await import('child_process');
        const os = await import('os');
        const path = await import('path');
        const platform = os.platform();
        
        if (platform === 'win32') {
          const child = spawn('explorer.exe',['/select,', filePath], { detached: true });
          child.unref();
        } else if (platform === 'darwin') {
          const child = spawn('open',['-R', filePath], { detached: true });
          child.unref();
        } else {
          const dir = path.dirname(filePath);
          const child = spawn('xdg-open',[dir], { detached: true });
          child.unref();
        }
      } else if (typeof window !== 'undefined' && window.require) {
        const { shell } = window.require('electron');
        shell.showItemInFolder(filePath);
      }
    } catch (err) {
      console.error("Failed to open folder:", err.message || err);
    }
  };

  const handleCopyText = (text) => {
    if (text) navigator.clipboard.writeText(text);
  };

  const handleCopyImage = async (url) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } catch (err) {
      console.error("Failed to copy image", err);
    }
  };

  const handleToggleLiveDecryption = () => {
    const newVal = !liveDecryption;
    setLiveDecryption(newVal);
    localStorage.setItem('pear_live_decryption', newVal);
    if (newVal) {
      setAnimationTrigger(Date.now()); 
    }
  };

  if (!isDMView && !activeChannel) {
    return (
      <div className="flex-1 flex flex-col bg-panel min-w-0 relative h-full items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-surface rounded-full mx-auto mb-4 flex items-center justify-center text-4xl text-muted">#</div>
          <h2 className="text-xl font-bold text-text mb-2">No Channels Available</h2>
          <p className="text-muted text-sm">You don't have access to any channels in this hub, or none exist.</p>
        </div>
      </div>
    );
  }

  const currentChannelMessages = messages.filter(m => {
    if (isDMView && !isGroupChat) return (m.sender === myKey && m.recipient === activeChannel) || (m.sender === activeChannel && m.recipient === myKey);
    return m.channel === networkChannelId && !m.recipient;
  });

  const myMessages = currentChannelMessages.filter(m => m.sender === myKey);
  const lastMyMessageId = myMessages.length > 0 ? myMessages[myMessages.length - 1].id : null;
  
  const readMsgId = readReceipts[networkChannelId];
  const explicitDeliveredMsgId = deliveredReceipts ? deliveredReceipts[networkChannelId] : null;
  
  const readMsgIndex = currentChannelMessages.findIndex(m => m.id === readMsgId);
  const explicitDeliveredMsgIndex = currentChannelMessages.findIndex(m => m.id === explicitDeliveredMsgId);

  const isPeerOnline = (isDMView && !isGroupChat) ? onlinePeers.some(p => p.key === activeChannel) : onlinePeers.length > 0;
  
  let effectiveDeliveredMsgIndex = explicitDeliveredMsgIndex;
  if (isPeerOnline && isDMView && !isGroupChat) effectiveDeliveredMsgIndex = currentChannelMessages.length - 1;

  let lastMyReadMsgId = null;
  let lastMyDeliveredMsgId = null;

  for (let i = currentChannelMessages.length - 1; i >= 0; i--) {
    const m = currentChannelMessages[i];
    if (m.sender === myKey) {
      if (!lastMyDeliveredMsgId && effectiveDeliveredMsgIndex !== -1 && i <= effectiveDeliveredMsgIndex) lastMyDeliveredMsgId = m.id;
      if (!lastMyReadMsgId && readMsgIndex !== -1 && i <= readMsgIndex) lastMyReadMsgId = m.id;
    }
  }

  const getMessageStatus = (msg) => {
    if (msg.sender !== myKey) return null;
    const msgIndex = currentChannelMessages.findIndex(m => m.id === msg.id);

    if (isDMView && !isGroupChat) {
      if (msg.id === lastMyReadMsgId) {
        const hasNewerReply = currentChannelMessages.slice(msgIndex + 1).some(m => m.sender !== myKey);
        if (!hasNewerReply) {
          const targetProfile = dms[activeChannel]?.profile || {};
          return (
            <div className="w-[14px] h-[14px] rounded-full overflow-hidden inline-block ml-2 align-middle bg-surface border border-panel" title="Read">
              {targetProfile.avatar ? (
                <img src={targetProfile.avatar} className="w-full h-full object-cover rounded-full" />
              ) : (
                <div className="w-full h-full bg-indigo-500 rounded-full flex items-center justify-center text-[6px] text-white font-bold">
                  {targetProfile.displayName?.substring(0, 2).toUpperCase() || '?'}
                </div>
              )}
            </div>
          );
        }
      }

      const isAfterRead = readMsgIndex === -1 || msgIndex > readMsgIndex;
      if (isAfterRead) {
        const isDelivered = effectiveDeliveredMsgIndex !== -1 && msgIndex <= effectiveDeliveredMsgIndex;
        if (isDelivered) return <span className="text-blue-400 text-[10px] ml-2 uppercase font-bold tracking-wider" title="Delivered">✓✓</span>;
        else return <span className="text-muted text-[10px] ml-2 uppercase font-bold tracking-wider" title="Sent">✓</span>;
      }
      return null;
    } else {
      if (msg.id !== lastMyMessageId) return null;
      const isRead = readMsgIndex !== -1 && msgIndex <= readMsgIndex;
      if (isRead) return <span className="text-blue-400 ml-2 text-xs" title="Read">✓✓</span>;
      if (isPeerOnline) return <span className="text-muted ml-2 text-xs" title="Delivered">✓✓</span>;
      return <span className="text-muted/50 ml-2 text-xs" title="Sent">✓</span>;
    }
  };

  const headerName = isGroupChat ? gcObj.name : (isDMView ? (dms[activeChannel]?.profile?.displayName || 'Unknown') : activeChannel);
  const headerIcon = isGroupChat ? '👥' : (isDMView ? '@' : '#');

  let typingText = '';
  if (activeTypers.length === 1) typingText = `${activeTypers[0]} is typing...`;
  else if (activeTypers.length > 1) typingText = `Several people are typing...`;

  const isCallActiveInThisDM = activeCall && activeCall.targetKey === activeChannel;

  return (
    <div 
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="flex-1 flex flex-col bg-panel min-w-0 relative h-full"
    >
      {isDragging && canUpload && (
        <div className="absolute inset-0 z-50 bg-accent/90 flex items-center justify-center backdrop-blur-sm m-4 rounded-xl border-2 border-dashed border-white pointer-events-none">
          <div className="text-center text-white">
            <svg className="w-20 h-20 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <h2 className="text-3xl font-bold">Drop files to upload</h2>
          </div>
        </div>
      )}

      {expandedImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center backdrop-blur-sm" onClick={() => setExpandedImage(null)}>
          <img src={expandedImage} className="max-w-[90vw] max-h-[90vh] object-contain" onClick={(e) => e.stopPropagation()} />
          <button className="absolute top-6 right-6 text-white hover:text-gray-300" onClick={() => setExpandedImage(null)}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      )}

      {profileViewUser && (
        <UserProfileModal 
          user={profileViewUser} 
          onClose={() => setProfileViewUser(null)} 
          onSendDM={profileViewUser.key !== myKey ? (u) => {
            if (!dms[u.key]) {
              network.sendDMRequest(u.key, { displayName: u.displayName, username: u.username, avatar: u.avatar, bio: u.bio, connections: u.connections });
            }
            if (onNavigateToDM) onNavigateToDM(u.key);
          } : null}
        />
      )}

      {contextMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}>
          <div 
            className="absolute bg-panel border border-surface shadow-xl rounded py-1.5 w-48 flex flex-col"
            style={{ 
              top: Math.min(contextMenu.y, window.innerHeight - 200), 
              left: Math.min(contextMenu.x, window.innerWidth - 200) 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {canReact && (
              <div className="flex justify-between px-3 py-1.5 border-b border-surface mb-1">
                {QUICK_EMOJIS.map(emoji => (
                  <button 
                    key={emoji} 
                    onClick={() => {
                      network.sendReaction(contextMenu.msg.id, emoji, isDMView && !isGroupChat, activeChannel);
                      setContextMenu(null);
                    }}
                    className="hover:bg-surface rounded p-1 transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            
            {canPost && (
              <button 
                className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  setReplyingTo(contextMenu.msg);
                  textareaRef.current?.focus();
                  setContextMenu(null);
                }}
              >
                Reply
              </button>
            )}

            {contextMenu.msg.text && (
              <button 
                className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  handleCopyText(contextMenu.msg.text);
                  setContextMenu(null);
                }}
              >
                Copy Text
              </button>
            )}

            {contextMenu.msg.payload?.type === 'file' && contextMenu.msg.payload.file.mimeType?.startsWith('image/') && (
              <button 
                className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  const url = contextMenu.msg.localBlobUrl || `peercord://local/${encodeURIComponent(contextMenu.msg.localPath.replace(/\\/g, '/'))}`;
                  handleCopyImage(url);
                  setContextMenu(null);
                }}
              >
                Copy Image
              </button>
            )}

            {contextMenu.isMe && contextMenu.msg.payload?.type !== 'server_invite' && (
              <button 
                className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-accent hover:text-white transition-colors"
                onClick={() => {
                  startEditing(contextMenu.msg);
                  setContextMenu(null);
                }}
              >
                Edit Message
              </button>
            )}
            {(contextMenu.isAdmin || contextMenu.isMe) && (
              <button 
                className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                onClick={() => {
                  network.sendDeleteMessage(contextMenu.msg.id);
                  setContextMenu(null);
                }}
              >
                Delete Message
              </button>
            )}
          </div>
        </div>
      )}

      <div className="h-14 shadow-sm flex items-center px-4 border-b border-base gap-3 shrink-0 bg-panel z-10">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-muted text-2xl shrink-0">{headerIcon}</span>
          <span className="font-bold text-text truncate">{headerName}</span>
        </div>
        
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {isDMView && !isGroupChat && (
            <>
              <button 
                onClick={handleToggleLiveDecryption} 
                className={`p-2 rounded transition-colors flex items-center gap-2 text-xs font-bold ${liveDecryption ? 'bg-accent/20 text-accent' : 'text-muted hover:text-text'}`} 
                title="Toggle Live Decryption Animation"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l3-9 5 18 3-9h5"></path></svg>
                {liveDecryption ? 'Live Decryption ON' : 'Live Decryption OFF'}
              </button>
              <button 
                onClick={() => setShowCrypto(!showCrypto)} 
                className={`p-2 rounded transition-colors flex items-center gap-2 text-xs font-bold ${showCrypto ? 'bg-green-500/20 text-green-500' : 'text-muted hover:text-text'}`} 
                title="Toggle Developer Crypto Mode"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                {showCrypto ? 'E2EE Verified' : 'Verify E2EE'}
              </button>
            </>
          )}
          {(isDMView || isGroupChat) && (
            <>
              {isGroupChat && (
                <button onClick={() => onOpenInvite(activeChannel)} className="text-muted hover:text-text p-2 transition-colors" title="Add Contacts">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5c-2.2 0-4 1.8-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                </button>
              )}
              {isCallActiveInThisDM ? (
                <button 
                  onClick={onReturnToCall} 
                  className="bg-accent hover:opacity-90 text-white px-3 py-1 rounded text-sm font-bold transition-opacity flex items-center gap-2" 
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  Return to Call
                </button>
              ) : (
                <>
                  <button 
                    onClick={() => onStartCall(activeChannel, 'voice')} 
                    className="text-muted hover:text-text p-2 transition-colors" 
                    title="Start Voice Call"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  </button>
                  <button 
                    onClick={() => onStartCall(activeChannel, 'video')} 
                    className="text-muted hover:text-text p-2 transition-colors" 
                    title="Start Video Call"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                  </button>
                </>
              )}
            </>
          )}
          {(!isDMView || isGroupChat) && !pinMembers && (
            <button onClick={onToggleMembers} className="text-muted hover:text-text p-2 transition-colors" title="Toggle Members">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto flex flex-col" ref={chatContainerRef}>
        <div className="mt-auto"></div>
        <div className="text-center my-8">
          <div className="w-20 h-20 bg-surface rounded-full mx-auto mb-4 flex items-center justify-center text-4xl text-text">{headerIcon}</div>
          <h1 className="text-3xl font-bold text-text mb-2">{isGroupChat ? `Welcome to ${headerName}!` : (isDMView ? headerName : `Welcome to #${headerName}!`)}</h1>
          <p className="text-muted">
            {isGroupChat ? `This is the beginning of your group whisper history.` : (isDMView ? `This is the beginning of your whisper history with ${headerName}.` : `This is the start of the decentralized #${headerName} room.`)}
          </p>
        </div>

        {currentChannelMessages.map((msg) => {
          const isPlatformAdmin = msg.sender === ADMIN_PUBLIC_KEY;
          let isServerOwner = false;
          let canDelete = false;
          
          if (!isDMView || isGroupChat) {
            const activeServerObj = servers.find(s => s.topicHex === (isGroupChat ? activeChannel : activeView));
            if (activeServerObj) {
              if (activeServerObj.owner === msg.sender) isServerOwner = true;
              if (activeServerObj.owner === myKey) canDelete = true;
              else {
                const userRoles = activeServerObj.memberRoles?.[myKey] || [];
                const hasAdmin = userRoles.some(rId => {
                  const r = activeServerObj.roles?.find(role => role.id === rId);
                  return r && r.permissions.includes('admin');
                });
                if (hasAdmin) canDelete = true;
              }
            }
          }
          
          const showCrown = isPlatformAdmin || isServerOwner;
          const crownTitle = isServerOwner ? (isGroupChat ? "Group Creator" : "Hub Owner") : "Platform Admin";
          const isMe = msg.sender === myKey;

          if (ircMode) {
            return (
              <div 
                key={msg.id} 
                id={`msg-${msg.id}`}
                className="flex gap-2 w-full hover:bg-panel/40 px-4 py-0.5 group/msg relative transition-colors"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.pageX, y: e.pageY, msg, isMe, isAdmin: canDelete || isPlatformAdmin });
                }}
              >
                <span className="text-muted text-xs font-mono shrink-0 mt-0.5">[{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>
                <span className="font-bold text-text shrink-0 cursor-pointer hover:underline" onClick={() => openProfile(msg.sender)}>
                  &lt;{isMe ? `${profile.displayName}` : msg.senderName}&gt;
                </span>
                <div className="text-text text-[14px] leading-relaxed flex-1 min-w-0">
                  {msg.replyTo && (() => {
                    const repliedMsg = messages.find(m => m.id === msg.replyTo);
                    if (repliedMsg) return <span className="text-accent mr-2 cursor-pointer hover:underline" onClick={() => document.getElementById(`msg-${repliedMsg.id}`)?.scrollIntoView({behavior: 'smooth'})}>@{repliedMsg.senderName}</span>;
                    return null;
                  })()}
                  {msg.payload?.type === 'file' ? (
                    <span className="text-accent italic">[File: {msg.payload.file.name}]</span>
                  ) : msg.payload?.type === 'server_invite' ? (
                    <span className="text-accent italic">[Server Invite: {msg.payload.serverName}]</span>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                  )}
                  {msg.edited && <span className="text-[10px] text-muted ml-2">(edited)</span>}
                </div>

                {/* Actions for IRC Mode */}
                <div className={`absolute right-4 -top-3 flex flex-col items-end ${fullEmojiPicker === msg.id ? 'opacity-100 z-50' : (fullEmojiPicker ? 'opacity-0 pointer-events-none z-10' : 'opacity-0 group-hover/msg:opacity-100 z-10')}`}>
                  <div className="flex items-center bg-surface border border-panel rounded-md shadow-sm overflow-hidden">
                    {canReact && QUICK_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={(e) => {
                          e.stopPropagation();
                          network.sendReaction(msg.id, emoji, isDMView && !isGroupChat, activeChannel);
                        }}
                        className="hover:bg-panel p-1.5 transition-colors text-base"
                        title="React"
                      >
                        {emoji}
                      </button>
                    ))}
                    {canReact && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFullEmojiPicker(fullEmojiPicker === msg.id ? null : msg.id);
                            setEmojiPickerDirection(e.clientY > window.innerHeight / 2 ? 'up' : 'down');
                          }}
                          className="text-muted hover:text-text hover:bg-panel p-2 transition-colors"
                          title="Add Reaction"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                        </button>
                      </div>
                    )}
                    {canPost && (
                      <button onClick={(e) => { e.stopPropagation(); setReplyingTo(msg); textareaRef.current?.focus(); }} className="text-muted hover:text-text hover:bg-panel p-2 transition-colors" title="Reply">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                      </button>
                    )}
                    {isMe && msg.payload?.type !== 'server_invite' && (
                      <button onClick={(e) => { e.stopPropagation(); startEditing(msg); }} className="text-muted hover:text-text hover:bg-panel p-2 transition-colors" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </button>
                    )}
                    {(canDelete || isPlatformAdmin || isMe) && (
                      <button onClick={(e) => { e.stopPropagation(); network.sendDeleteMessage(msg.id); }} className="text-red-500 hover:text-red-400 hover:bg-panel p-2 transition-colors" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    )}
                  </div>
                  {fullEmojiPicker === msg.id && (
                    <div className={`absolute right-0 ${emojiPickerDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} bg-panel border border-surface rounded shadow-xl p-2 w-64 h-48 overflow-y-auto custom-scrollbar z-50 grid grid-cols-6 gap-1`} onClick={e => e.stopPropagation()}>
                      {ALL_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={(e) => {
                            e.stopPropagation();
                            network.sendReaction(msg.id, emoji, isDMView && !isGroupChat, activeChannel);
                            setFullEmojiPicker(null);
                          }}
                          className="hover:bg-surface rounded p-1 text-lg transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div 
              key={msg.id} 
              id={`msg-${msg.id}`}
              className="flex flex-col w-full hover:bg-panel/40 px-4 py-2 mt-1 group/msg relative transition-colors"
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.pageX, y: e.pageY, msg, isMe, isAdmin: canDelete || isPlatformAdmin });
              }}
            >
              {/* Reply Row */}
              {msg.replyTo && (() => {
                const repliedMsg = messages.find(m => m.id === msg.replyTo);
                if (!repliedMsg) return <div className="text-[10px] text-muted italic mb-1 pl-[72px]">Replying to a deleted message</div>;
                return (
                  <div 
                    className="flex items-center gap-1.5 text-sm text-muted mb-1 relative pl-[72px] cursor-pointer hover:text-text select-none" 
                    onClick={() => document.getElementById(`msg-${repliedMsg.id}`)?.scrollIntoView({behavior: 'smooth'})}
                  >
                    <div className="absolute left-[35px] top-[12px] w-[33px] h-[14px] border-l-2 border-t-2 border-muted/50 rounded-tl-md"></div>
                    {repliedMsg.senderAvatar ? (
                      <img src={repliedMsg.senderAvatar} className="w-4 h-4 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-[8px] text-white font-bold shrink-0">
                        {repliedMsg.senderName.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="font-bold text-text/80 hover:underline">@{repliedMsg.senderName}</span>
                    <span className="truncate max-w-md">{repliedMsg.text || 'Attachment'}</span>
                  </div>
                );
              })()}

              {/* Main Message Row */}
              <div className="flex gap-4">
                <div 
                  className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold overflow-hidden mt-0.5 cursor-pointer ${msg.senderAvatar ? 'bg-transparent' : 'bg-indigo-500'}`}
                  onClick={() => openProfile(msg.sender)}
                >
                  {msg.senderAvatar ? <img src={msg.senderAvatar} className="w-full h-full object-cover" /> : msg.senderName.substring(0, 2).toUpperCase()}
                </div>
                
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-medium text-text flex items-center gap-1 cursor-pointer hover:underline" onClick={() => openProfile(msg.sender)}>
                      {isMe ? `${profile.displayName} (You)` : msg.senderName}
                      {showCrown && <span title={crownTitle} className="text-yellow-500 text-xs">👑</span>}
                    </span>
                    <span className="text-xs text-muted">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {getMessageStatus(msg)}
                  </div>
                  
                  <div className="text-text text-[15px] leading-relaxed">
                    {showCrypto && msg.isEncrypted ? (
                      <div className="bg-black/50 border border-green-500/30 p-3 rounded-md font-mono text-[11px] text-green-400 break-all my-1">
                        <div className="text-green-500/50 mb-1 select-none">Algorithm: xchacha20poly1305_ietf</div>
                        <div className="text-green-500/50 mb-1 select-none">Nonce: {msg.nonce}</div>
                        <div className="select-all">{msg.cipher}</div>
                      </div>
                    ) : editingId === msg.id ? (
                      <div className="mt-1 min-w-[200px]">
                        <textarea 
                          ref={editTextareaRef}
                          value={editInput} 
                          onChange={handleEditChange} 
                          onKeyDown={(e) => handleEditMessage(e, msg.id)} 
                          className="w-full bg-base text-text rounded p-2 outline-none resize-none max-h-[50vh] custom-scrollbar border border-surface" 
                          rows={1}
                        />
                        <span className="text-[10px] text-muted mt-1 block">escape to cancel • enter to save • shift+enter for new line</span>
                      </div>
                    ) : msg.payload?.type === 'server_invite' ? (
                      <div className="mt-1 mb-1">
                        <ServerInviteCard invite={msg.payload} joinedServers={servers} />
                      </div>
                    ) : msg.payload?.type === 'file' ? (
                      <div className="flex flex-col w-full min-w-0">
                        {msg.text && (
                          <DecryptedMessage msg={msg} liveDecryption={liveDecryption} animationTrigger={animationTrigger} components={markdownComponents} />
                        )}
                        
                        {(() => {
                          const fileMeta = msg.payload.file;
                          const transfer = transfers[msg.id];
                          const isImage = fileMeta.mimeType?.startsWith('image/');
                          const isVideo = fileMeta.mimeType?.startsWith('video/');
                          
                          const isComplete = !!msg.localPath || !!msg.localBlobUrl;
                          const isSender = msg.sender === myKey;
                          
                          const stateText = transfer ? (
                            transfer.state === 'processing' ? 'Processing Local File...' :
                            transfer.state === 'uploading' ? 'Uploading to Peer...' :
                            transfer.state === 'downloading' ? 'Downloading...' : 'Complete'
                          ) : 'Waiting for peer...';

                          if (!isComplete) {
                            return (
                              <div className="bg-panel p-4 rounded-lg border border-surface w-80 mt-1">
                                <div className="flex justify-between text-xs text-muted mb-2">
                                  <span className="font-bold text-text truncate pr-2">{fileMeta.name}</span>
                                  <span>{transfer ? Math.round(transfer.progress * 100) + '%' : '0%'}</span>
                                </div>
                                <div className="w-full bg-base rounded-full h-2 mb-2 overflow-hidden">
                                  <div className="bg-accent h-2 rounded-full transition-all duration-300" style={{ width: `${transfer ? transfer.progress * 100 : 0}%` }}></div>
                                </div>
                                <div className="flex justify-between text-[10px] text-muted items-center">
                                  <span>{formatBytes(fileMeta.size)}</span>
                                  <div className="flex items-center gap-2">
                                    <span>{stateText}</span>
                                    {transfer && transfer.state !== 'completed' && transfer.state !== 'processing' && (
                                      <span className="text-muted/70">• {formatBytes(transfer.speed)}/s</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          } else {
                            if (isImage || isVideo) {
                              const fileUrl = msg.localBlobUrl ? msg.localBlobUrl : `peercord://local/${encodeURIComponent(msg.localPath.replace(/\\/g, '/'))}`;

                              return (
                                <div className="mt-1 flex flex-col gap-1">
                                  {isImage && (
                                    <img src={fileUrl} alt={fileMeta.name} className="max-w-sm max-h-80 rounded-lg object-contain cursor-pointer border border-surface bg-base" onClick={() => setExpandedImage(fileUrl)} />
                                  )}
                                  {isVideo && (
                                    <video 
                                      src={fileUrl} 
                                      controls 
                                      preload="metadata" 
                                      className="max-w-md max-h-96 rounded-lg border border-surface bg-black" 
                                    />
                                  )}
                                  {transfer && transfer.state === 'uploading' && transfer.progress < 1 && (
                                    <div className="flex items-center gap-2 text-[10px] text-muted mt-1 bg-panel p-2 rounded w-fit border border-surface">
                                      <div className="w-24 bg-base rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-accent h-1.5 rounded-full transition-all duration-300" style={{ width: `${transfer.progress * 100}%` }}></div>
                                      </div>
                                      <span>{transfer.progress > 0 ? `Uploading to peer... ${Math.round(transfer.progress * 100)}% • ${formatBytes(transfer.speed)}/s` : 'Seeding file...'}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            } else {
                              if (isSender) {
                                return (
                                  <div className="mt-1 flex flex-col gap-1">
                                    <div className="bg-panel p-3 rounded-lg border border-surface flex items-center gap-3 w-80">
                                      <div className="w-10 h-10 bg-base rounded flex items-center justify-center text-text shrink-0">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                                      </div>
                                      <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm font-bold text-text truncate">{fileMeta.name}</span>
                                        <span className="text-xs text-muted">{formatBytes(fileMeta.size)} • Sent File</span>
                                      </div>
                                    </div>
                                    {transfer && transfer.state === 'uploading' && transfer.progress < 1 && (
                                      <div className="flex items-center gap-2 text-[10px] text-muted mt-1 bg-panel p-2 rounded w-fit border border-surface">
                                        <div className="w-24 bg-base rounded-full h-1.5 overflow-hidden">
                                          <div className="bg-accent h-1.5 rounded-full transition-all duration-300" style={{ width: `${transfer.progress * 100}%` }}></div>
                                        </div>
                                        <span>{transfer.progress > 0 ? `Uploading to peer... ${Math.round(transfer.progress * 100)}% • ${formatBytes(transfer.speed)}/s` : 'Seeding file...'}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              } else {
                                return (
                                  <div className="mt-1 flex flex-col gap-1">
                                    <div className="bg-panel p-3 rounded-lg border border-surface flex items-center gap-3 w-80 cursor-pointer hover:bg-base transition-colors" onClick={() => handleOpenFolder(msg.localPath)}>
                                      <div className="w-10 h-10 bg-base rounded flex items-center justify-center text-text shrink-0">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                                      </div>
                                      <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm font-bold text-text truncate">{fileMeta.name}</span>
                                        <span className="text-xs text-muted">{formatBytes(fileMeta.size)} • Click to show in folder</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                            }
                          }
                        })()}
                      </div>
                    ) : (
                      <div className="flex flex-col w-full min-w-0">
                        <DecryptedMessage msg={msg} liveDecryption={liveDecryption} animationTrigger={animationTrigger} components={markdownComponents} />
                      </div>
                    )}
                    {msg.edited && !showCrypto && <span className="text-[10px] text-muted ml-2">(edited)</span>}
                    
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(msg.reactions).map(([emoji, users]) => (
                          <button 
                            key={emoji}
                            onClick={() => {
                              if (canReact) network.sendReaction(msg.id, emoji, isDMView && !isGroupChat, activeChannel);
                            }}
                            disabled={!canReact}
                            className={`px-1.5 py-0.5 rounded text-xs flex items-center gap-1 border ${users.includes(myKey) ? 'bg-accent/20 border-accent text-accent' : 'bg-surface border-panel text-muted hover:border-muted'} ${!canReact ? 'cursor-not-allowed opacity-80' : ''}`}
                          >
                            <span>{emoji}</span>
                            <span className="font-bold">{users.length}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className={`absolute right-4 -top-3 flex flex-col items-end ${fullEmojiPicker === msg.id ? 'opacity-100 z-50' : (fullEmojiPicker ? 'opacity-0 pointer-events-none z-10' : 'opacity-0 group-hover/msg:opacity-100 z-10')}`}>
                  <div className="flex items-center bg-surface border border-panel rounded-md shadow-sm overflow-hidden">
                    {canReact && QUICK_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={(e) => {
                          e.stopPropagation();
                          network.sendReaction(msg.id, emoji, isDMView && !isGroupChat, activeChannel);
                        }}
                        className="hover:bg-panel p-1.5 transition-colors text-base"
                        title="React"
                      >
                        {emoji}
                      </button>
                    ))}
                    {canReact && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFullEmojiPicker(fullEmojiPicker === msg.id ? null : msg.id);
                            setEmojiPickerDirection(e.clientY > window.innerHeight / 2 ? 'up' : 'down');
                          }}
                          className="text-muted hover:text-text hover:bg-panel p-2 transition-colors"
                          title="Add Reaction"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                        </button>
                      </div>
                    )}
                    {canPost && (
                      <button onClick={(e) => { e.stopPropagation(); setReplyingTo(msg); textareaRef.current?.focus(); }} className="text-muted hover:text-text hover:bg-panel p-2 transition-colors" title="Reply">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                      </button>
                    )}
                    {isMe && msg.payload?.type !== 'server_invite' && (
                      <button onClick={(e) => { e.stopPropagation(); startEditing(msg); }} className="text-muted hover:text-text hover:bg-panel p-2 transition-colors" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </button>
                    )}
                    {(canDelete || isPlatformAdmin || isMe) && (
                      <button onClick={(e) => { e.stopPropagation(); network.sendDeleteMessage(msg.id); }} className="text-red-500 hover:text-red-400 hover:bg-panel p-2 transition-colors" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    )}
                  </div>
                  {fullEmojiPicker === msg.id && (
                    <div className={`absolute right-0 ${emojiPickerDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} bg-panel border border-surface rounded shadow-xl p-2 w-64 h-48 overflow-y-auto custom-scrollbar z-50 grid grid-cols-6 gap-1`} onClick={e => e.stopPropagation()}>
                      {ALL_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={(e) => {
                            e.stopPropagation();
                            network.sendReaction(msg.id, emoji, isDMView && !isGroupChat, activeChannel);
                            setFullEmojiPicker(null);
                          }}
                          className="hover:bg-surface rounded p-1 text-lg transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 pb-4 pt-1 shrink-0 relative">
        <div className="absolute -top-6 left-4 text-xs font-medium text-muted flex items-center gap-1.5 h-6">
          {typingText && (
            <><span className="flex gap-1 items-center mr-1"><span className="w-1.5 h-1.5 rounded-full typing-dot" style={{ animationDelay: '0s' }}></span><span className="w-1.5 h-1.5 rounded-full typing-dot" style={{ animationDelay: '0.15s' }}></span><span className="w-1.5 h-1.5 rounded-full typing-dot" style={{ animationDelay: '0.3s' }}></span></span>{typingText}</>
          )}
        </div>

        {mentionQuery !== null && filteredMentions.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 w-64 bg-panel border border-surface rounded-lg shadow-xl overflow-hidden z-50">
            <div className="bg-surface px-3 py-1.5 text-xs font-bold text-muted uppercase border-b border-panel">
              {mentionType === 'channel' ? 'Channels' : 'Members'}
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              {filteredMentions.map((item, i) => (
                <div 
                  key={item.isChannel ? item.name : item.username} 
                  onClick={() => insertMention(item)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${i === mentionIndex ? 'bg-accent/20' : 'hover:bg-surface'}`}
                >
                  {item.isChannel ? (
                    <>
                      <div className="w-6 h-6 rounded-full bg-base flex items-center justify-center text-muted font-bold text-xs">
                        {item.type === 'text' ? '#' : '🔊'}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-bold text-text truncate">{item.name}</span>
                        <span className="text-[10px] text-muted truncate">{item.type === 'text' ? 'Text Channel' : 'Voice Channel'}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {item.isSpecial ? (
                        <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-white font-bold text-xs">@</div>
                      ) : (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold overflow-hidden ${item.avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
                          {item.avatar ? <img src={item.avatar} className="w-full h-full object-cover" /> : item.displayName.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-bold text-text truncate">{item.displayName}</span>
                        <span className="text-[10px] text-muted truncate">@{item.username}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {replyingTo && (
          <div className="bg-surface px-4 py-2 rounded-t-lg border-b border-base flex items-center justify-between text-sm text-muted">
            <div className="flex items-center gap-2 truncate">
              <span className="font-bold">Replying to @{replyingTo.senderName}</span>
              <span className="truncate max-w-md">{replyingTo.text || 'Attachment'}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="hover:text-text">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className={`bg-surface p-4 border-b border-base flex gap-4 overflow-x-auto custom-scrollbar mx-0 ${replyingTo ? '' : 'rounded-t-lg mt-2'}`}>
            {attachments.map((att, i) => (
              <div key={i} className="relative w-40 h-40 bg-base rounded-lg border border-panel flex flex-col items-center justify-center shrink-0 group">
                <button onClick={() => setAttachments(prev => prev.filter((_, index) => index !== i))} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                {att.preview ? (
                  <img src={att.preview} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <div className="text-muted flex flex-col items-center gap-2 p-2 text-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                    <span className="text-xs font-bold truncate w-full">{att.name}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={`bg-surface p-3 flex items-center gap-3 relative ${(attachments.length > 0 || replyingTo) ? 'rounded-b-lg' : 'rounded-lg'}`}>
          <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => processFiles(e.target.files)} />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="w-6 h-6 rounded-full bg-muted hover:bg-text text-base flex items-center justify-center shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canPost || !canUpload || !myKey}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          
          <textarea 
            ref={textareaRef}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={canPost ? `Message ${isGroupChat ? '' : (isDMView ? '@' : '#')}${headerName}` : "You do not have permission to post in this room"} 
            className="bg-transparent border-none outline-none text-text w-full disabled:opacity-50 resize-none max-h-[50vh] custom-scrollbar"
            disabled={!canPost || !myKey}
            rows={1}
          />
        </div>
      </div>
    </div>
  );
}