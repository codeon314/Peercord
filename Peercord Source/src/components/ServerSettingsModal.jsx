import React, { useState, useRef } from 'react';
import { network, ADMIN_PUBLIC_KEY } from '../p2p/index.js';

export default function ServerSettingsModal({ onClose, activeServerObj, myKey, onDeleteServer }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [openRoleMenu, setOpenRoleMenu] = useState(null);
  
  const [serverName, setServerName] = useState(activeServerObj.name || '');
  const [serverIcon, setServerIcon] = useState(activeServerObj.icon || null);
  const [allowAnyone, setAllowAnyone] = useState(activeServerObj.allowAnyoneToInvite);
  
  const [channels, setChannels] = useState(activeServerObj.channels || { text: ['general-chat'], voice: ['general-voice'], permissions: {}, send_permissions: {} });
  const [roles, setRoles] = useState(activeServerObj.roles || []);
  const [memberRoles, setMemberRoles] = useState(activeServerObj.memberRoles || {});
  
  const [editingRole, setEditingRole] = useState(null);
  const [editingChannel, setEditingChannel] = useState(null);
  const fileInputRef = useRef(null);

  const serverMembers = network.serverMembers[activeServerObj.topicHex] ? Array.from(network.serverMembers[activeServerObj.topicHex]) : [];
  if (!serverMembers.includes(activeServerObj.owner)) serverMembers.push(activeServerObj.owner);

  const userRoles = activeServerObj.memberRoles?.[myKey] || [];
  const isServerAdmin = activeServerObj.owner === myKey || myKey === ADMIN_PUBLIC_KEY || userRoles.some(rId => {
    const r = activeServerObj.roles?.find(role => role.id === rId);
    return r && r.permissions.includes('admin');
  });
  const canManageRoles = isServerAdmin || userRoles.some(rId => {
    const r = activeServerObj.roles?.find(role => role.id === rId);
    return r && r.permissions.includes('manage_roles');
  });
  const canManageChannels = isServerAdmin || userRoles.some(rId => {
    const r = activeServerObj.roles?.find(role => role.id === rId);
    return r && r.permissions.includes('manage_channels');
  });
  const canKickMembers = isServerAdmin || userRoles.some(rId => {
    const r = activeServerObj.roles?.find(role => role.id === rId);
    return r && r.permissions.includes('kick_members');
  });

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 128;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.8);
        setServerIcon(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (serverName.trim() === '') return;
    network.updateServerSettings(activeServerObj.topicHex, serverName.trim(), serverIcon, allowAnyone, channels, roles, memberRoles);
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to completely delete this hub? All members will be removed and message history will be permanently wiped for everyone. This cannot be undone.")) {
      onDeleteServer();
    }
  };

  const createRole = () => {
    const newRole = {
      id: 'role_' + Date.now(),
      name: 'New Role',
      color: '#9ca3af',
      permissions: ['send_messages', 'read_messages']
    };
    setRoles([...roles, newRole]);
    setEditingRole(newRole);
  };

  const updateEditingRole = (key, value) => {
    setEditingRole({ ...editingRole, [key]: value });
  };

  const togglePermission = (perm) => {
    const perms = new Set(editingRole.permissions);
    if (perms.has(perm)) perms.delete(perm);
    else perms.add(perm);
    updateEditingRole('permissions', Array.from(perms));
  };

  const saveRole = () => {
    setRoles(roles.map(r => r.id === editingRole.id ? editingRole : r));
    setEditingRole(null);
  };

  const deleteRole = (roleId) => {
    setRoles(roles.filter(r => r.id !== roleId));
    const newMemberRoles = { ...memberRoles };
    for (const member in newMemberRoles) {
      newMemberRoles[member] = newMemberRoles[member].filter(id => id !== roleId);
    }
    setMemberRoles(newMemberRoles);
    
    // Remove role from channel permissions
    const newChannels = { ...channels, permissions: { ...channels.permissions }, send_permissions: { ...channels.send_permissions } };
    for (const ch in newChannels.permissions) {
      newChannels.permissions[ch] = newChannels.permissions[ch].filter(id => id !== roleId);
    }
    for (const ch in newChannels.send_permissions) {
      newChannels.send_permissions[ch] = newChannels.send_permissions[ch].filter(id => id !== roleId);
    }
    setChannels(newChannels);
  };

  const toggleMemberRole = (memberKey, roleId) => {
    const currentRoles = memberRoles[memberKey] || [];
    const newRoles = currentRoles.includes(roleId) 
      ? currentRoles.filter(id => id !== roleId)
      : [...currentRoles, roleId];
    
    setMemberRoles({ ...memberRoles, [memberKey]: newRoles });
  };

  const toggleChannelRole = (channelName, roleId) => {
    const perms = channels.permissions || {};
    const currentRoles = perms[channelName] || [];
    const newRoles = currentRoles.includes(roleId)
      ? currentRoles.filter(id => id !== roleId)
      : [...currentRoles, roleId];
    
    setChannels({
      ...channels,
      permissions: {
        ...perms,
        [channelName]: newRoles
      }
    });
  };

  const toggleChannelSendRole = (channelName, roleId) => {
    const perms = channels.send_permissions || {};
    const currentRoles = perms[channelName] || [];
    const newRoles = currentRoles.includes(roleId)
      ? currentRoles.filter(id => id !== roleId)
      : [...currentRoles, roleId];
    
    setChannels({
      ...channels,
      send_permissions: {
        ...perms,
        [channelName]: newRoles
      }
    });
  };

  const handleKickMember = (memberKey) => {
    if (window.confirm("Are you sure you want to kick this member?")) {
      network._appendSignedMessage({ type: 'server_leave', serverTopicHex: activeServerObj.topicHex, targetUser: memberKey, timestamp: Date.now() });
      if (network.serverMembers[activeServerObj.topicHex]) {
        network.serverMembers[activeServerObj.topicHex].delete(memberKey);
        network._emitServerMembers();
      }
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div 
        className="bg-surface rounded-lg shadow-xl w-full max-w-3xl flex flex-col h-[80vh] border border-panel overflow-hidden" 
        onClick={e => { 
          e.stopPropagation(); 
          setOpenRoleMenu(null); 
        }}
      >
        
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-48 bg-panel flex flex-col py-6 px-3 border-r border-surface shrink-0">
            <h2 className="text-sm font-bold text-text mb-4 px-2 truncate">{activeServerObj.name}</h2>
            <button 
              onClick={() => { setActiveTab('overview'); setEditingChannel(null); setEditingRole(null); }}
              className={`text-left px-3 py-2 rounded text-sm font-medium mb-1 ${activeTab === 'overview' ? 'bg-surface text-text' : 'text-muted hover:bg-surface/50 hover:text-text'}`}
            >
              Overview
            </button>
            {canManageRoles && (
              <button 
                onClick={() => { setActiveTab('roles'); setEditingChannel(null); }}
                className={`text-left px-3 py-2 rounded text-sm font-medium mb-1 ${activeTab === 'roles' ? 'bg-surface text-text' : 'text-muted hover:bg-surface/50 hover:text-text'}`}
              >
                Roles
              </button>
            )}
            {canManageChannels && (
              <button 
                onClick={() => { setActiveTab('channels'); setEditingRole(null); }}
                className={`text-left px-3 py-2 rounded text-sm font-medium mb-1 ${activeTab === 'channels' ? 'bg-surface text-text' : 'text-muted hover:bg-surface/50 hover:text-text'}`}
              >
                Channels
              </button>
            )}
            <button 
              onClick={() => { setActiveTab('members'); setEditingChannel(null); setEditingRole(null); }}
              className={`text-left px-3 py-2 rounded text-sm font-medium mb-1 ${activeTab === 'members' ? 'bg-surface text-text' : 'text-muted hover:bg-surface/50 hover:text-text'}`}
            >
              Members
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              
              {activeTab === 'overview' && (
                <div className="flex flex-col gap-6">
                  <h3 className="text-xl font-bold text-text">Server Overview</h3>
                  
                  <div className="flex items-start gap-6">
                    <div 
                      className={`w-24 h-24 rounded-md flex items-center justify-center text-white text-3xl font-bold ${isServerAdmin ? 'cursor-pointer hover:border-text' : 'cursor-default'} relative group overflow-hidden shrink-0 border-2 border-dashed border-muted ${serverIcon ? 'bg-transparent border-solid' : 'bg-panel'}`}
                      onClick={() => isServerAdmin && fileInputRef.current?.click()}
                    >
                      {serverIcon ? (
                        <img src={serverIcon} alt="hub icon" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center text-xs text-muted flex flex-col items-center gap-1">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
                          {isServerAdmin ? 'Upload' : 'No Icon'}
                        </div>
                      )}
                      {isServerAdmin && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] uppercase tracking-wider text-white">Upload</span>
                        </div>
                      )}
                      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/png, image/jpeg" className="hidden" />
                    </div>

                    <div className="flex-1">
                      <label className="block text-xs font-bold text-muted uppercase mb-2">Hub Name</label>
                      <input 
                        type="text" 
                        value={serverName}
                        onChange={(e) => setServerName(e.target.value)}
                        disabled={!isServerAdmin}
                        className="w-full bg-panel text-text rounded p-3 outline-none focus:ring-2 focus:ring-accent mb-4 disabled:opacity-50"
                        maxLength={32}
                      />

                      <label className="block text-xs font-bold text-muted uppercase mb-2">Invite Permissions</label>
                      <div className="flex items-center gap-3 bg-panel p-3 rounded">
                        <input 
                          type="checkbox" 
                          checked={allowAnyone} 
                          onChange={(e) => setAllowAnyone(e.target.checked)}
                          disabled={!isServerAdmin}
                          className="w-5 h-5 accent-accent cursor-pointer disabled:opacity-50"
                        />
                        <span className="text-sm text-text">Anyone can invite people to this hub</span>
                      </div>
                      <p className="text-[10px] text-muted mt-1">If unchecked, only Admins can send invites.</p>
                    </div>
                  </div>

                  {isServerAdmin && (
                    <div className="bg-panel rounded p-4 border border-red-900/50 mt-4">
                      <h3 className="text-red-500 font-bold mb-2 uppercase text-xs">Danger Zone</h3>
                      <button 
                        onClick={handleDelete}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                      >
                        Delete Hub
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'roles' && canManageRoles && (
                <div className="flex flex-col h-full">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-text">Roles</h3>
                    {!editingRole && (
                      <button onClick={createRole} className="bg-accent hover:opacity-90 text-white px-3 py-1.5 rounded text-sm font-medium transition-opacity">
                        Create Role
                      </button>
                    )}
                  </div>

                  {editingRole ? (
                    <div className="flex flex-col gap-4 bg-panel p-4 rounded border border-surface">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-text">Edit Role</h4>
                        <button onClick={() => setEditingRole(null)} className="text-muted hover:text-text text-sm">Cancel</button>
                      </div>
                      
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-muted uppercase mb-2">Role Name</label>
                          <input 
                            type="text" 
                            value={editingRole.name}
                            onChange={(e) => updateEditingRole('name', e.target.value)}
                            className="w-full bg-base text-text rounded p-2 outline-none focus:ring-1 focus:ring-accent text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-muted uppercase mb-2">Role Color</label>
                          <input 
                            type="color" 
                            value={editingRole.color}
                            onChange={(e) => updateEditingRole('color', e.target.value)}
                            className="w-10 h-10 rounded cursor-pointer bg-transparent border-none p-0"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-muted uppercase mb-2 mt-2">Permissions</label>
                        <div className="space-y-2 bg-base p-3 rounded">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={editingRole.permissions.includes('admin')} onChange={() => togglePermission('admin')} className="w-4 h-4 accent-accent" />
                            <span className="text-sm text-text">Administrator (Full Access)</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={editingRole.permissions.includes('send_messages')} onChange={() => togglePermission('send_messages')} className="w-4 h-4 accent-accent" />
                            <span className="text-sm text-text">Send Messages</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={editingRole.permissions.includes('read_messages')} onChange={() => togglePermission('read_messages')} className="w-4 h-4 accent-accent" />
                            <span className="text-sm text-text">Read Messages</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={editingRole.permissions.includes('manage_channels')} onChange={() => togglePermission('manage_channels')} className="w-4 h-4 accent-accent" />
                            <span className="text-sm text-text">Manage Channels</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={editingRole.permissions.includes('manage_roles')} onChange={() => togglePermission('manage_roles')} className="w-4 h-4 accent-accent" />
                            <span className="text-sm text-text">Manage Roles</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={editingRole.permissions.includes('kick_members')} onChange={() => togglePermission('kick_members')} className="w-4 h-4 accent-accent" />
                            <span className="text-sm text-text">Kick Members</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={editingRole.permissions.includes('send_files')} onChange={() => togglePermission('send_files')} className="w-4 h-4 accent-accent" />
                            <span className="text-sm text-text">Send Files</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={editingRole.permissions.includes('add_reactions')} onChange={() => togglePermission('add_reactions')} className="w-4 h-4 accent-accent" />
                            <span className="text-sm text-text">Add Reactions</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={editingRole.permissions.includes('mention_everyone')} onChange={() => togglePermission('mention_everyone')} className="w-4 h-4 accent-accent" />
                            <span className="text-sm text-text">Mention Everyone</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-2">
                        <button onClick={saveRole} className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors">
                          Save Role
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {roles.map(role => (
                        <div key={role.id} className="flex items-center justify-between bg-panel p-3 rounded border border-surface group">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }}></div>
                            <span className="text-sm font-bold text-text">{role.name}</span>
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditingRole(role)} className="text-muted hover:text-text text-sm px-2">Edit</button>
                            <button onClick={() => deleteRole(role.id)} className="text-red-500 hover:text-red-400 text-sm px-2">Delete</button>
                          </div>
                        </div>
                      ))}
                      {roles.length === 0 && <div className="text-muted text-sm text-center py-4">No roles created yet.</div>}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'channels' && canManageChannels && (
                <div className="flex flex-col h-full">
                  <h3 className="text-xl font-bold text-text mb-6">Channels</h3>
                  
                  {editingChannel ? (
                    <div className="flex flex-col gap-4 bg-panel p-4 rounded border border-surface">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-text flex items-center gap-2">
                          <span className="text-muted">{editingChannel.type === 'text' ? '#' : '🔊'}</span>
                          {editingChannel.name} Permissions
                        </h4>
                        <button onClick={() => setEditingChannel(null)} className="text-muted hover:text-text text-sm">Back</button>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <h5 className="text-sm font-bold text-text mb-1">Who can access this channel?</h5>
                          <p className="text-xs text-muted mb-2">If no roles are selected, the channel is public to all members. Admins always have access.</p>
                          <div className="space-y-2 bg-base p-3 rounded">
                            {roles.map(role => {
                              const isChecked = (channels.permissions?.[editingChannel.name] || []).includes(role.id);
                              return (
                                <label key={role.id} className="flex items-center gap-3 cursor-pointer p-1 hover:bg-panel rounded">
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked} 
                                    onChange={() => toggleChannelRole(editingChannel.name, role.id)} 
                                    className="w-4 h-4 accent-accent" 
                                  />
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }}></div>
                                  <span className="text-sm text-text">{role.name}</span>
                                </label>
                              );
                            })}
                            {roles.length === 0 && <span className="text-xs text-muted">No roles created yet. Go to the Roles tab to create some.</span>}
                          </div>
                        </div>

                        {editingChannel.type === 'text' && (
                          <div>
                            <h5 className="text-sm font-bold text-text mb-1">Who can send messages?</h5>
                            <p className="text-xs text-muted mb-2">If no roles are selected, anyone with access can send messages (based on their global role).</p>
                            <div className="space-y-2 bg-base p-3 rounded">
                              {roles.map(role => {
                                const isChecked = (channels.send_permissions?.[editingChannel.name] || []).includes(role.id);
                                return (
                                  <label key={role.id} className="flex items-center gap-3 cursor-pointer p-1 hover:bg-panel rounded">
                                    <input 
                                      type="checkbox" 
                                      checked={isChecked} 
                                      onChange={() => toggleChannelSendRole(editingChannel.name, role.id)} 
                                      className="w-4 h-4 accent-accent" 
                                    />
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }}></div>
                                    <span className="text-sm text-text">{role.name}</span>
                                  </label>
                                );
                              })}
                              {roles.length === 0 && <span className="text-xs text-muted">No roles created yet.</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-bold text-muted uppercase mb-2">Text Channels</h4>
                        <div className="space-y-1">
                          {channels.text.map(ch => {
                            const restrictedCount = (channels.permissions?.[ch] || []).length;
                            const sendRestrictedCount = (channels.send_permissions?.[ch] || []).length;
                            return (
                              <div key={ch} className="flex items-center justify-between bg-panel p-2 rounded border border-surface group">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted">#</span>
                                  <span className="text-sm font-medium text-text">{ch}</span>
                                  {restrictedCount > 0 && <span className="text-[10px] bg-base px-1.5 py-0.5 rounded text-muted ml-2">Private ({restrictedCount} roles)</span>}
                                  {sendRestrictedCount > 0 && <span className="text-[10px] bg-base px-1.5 py-0.5 rounded text-muted ml-2">Read-Only ({sendRestrictedCount} roles)</span>}
                                </div>
                                <button onClick={() => setEditingChannel({ name: ch, type: 'text' })} className="text-muted hover:text-text text-xs px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  Edit Permissions
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-muted uppercase mb-2">Voice Channels</h4>
                        <div className="space-y-1">
                          {channels.voice.map(ch => {
                            const restrictedCount = (channels.permissions?.[ch] || []).length;
                            return (
                              <div key={ch} className="flex items-center justify-between bg-panel p-2 rounded border border-surface group">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted">🔊</span>
                                  <span className="text-sm font-medium text-text">{ch}</span>
                                  {restrictedCount > 0 && <span className="text-[10px] bg-base px-1.5 py-0.5 rounded text-muted ml-2">Private ({restrictedCount} roles)</span>}
                                </div>
                                <button onClick={() => setEditingChannel({ name: ch, type: 'voice' })} className="text-muted hover:text-text text-xs px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  Edit Permissions
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'members' && (
                <div className="flex flex-col h-full">
                  <h3 className="text-xl font-bold text-text mb-6">Members</h3>
                  <div className="space-y-2">
                    {serverMembers.map(memberKey => {
                      const profile = network.knownProfiles.get(memberKey) || { displayName: 'Unknown User' };
                      const userRoles = memberRoles[memberKey] || [];
                      
                      return (
                        <div key={memberKey} className="flex flex-col bg-panel p-3 rounded border border-surface gap-2">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold overflow-hidden ${profile.avatar ? 'bg-transparent' : 'bg-indigo-500'}`}>
                              {profile.avatar ? <img src={profile.avatar} className="w-full h-full object-cover" /> : profile.displayName.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="text-sm font-bold text-text">{profile.displayName} {memberKey === activeServerObj.owner && <span className="text-yellow-500 ml-1" title="Owner">👑</span>}</span>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 mt-1">
                            {userRoles.map(rId => {
                              const role = roles.find(r => r.id === rId);
                              if (!role) return null;
                              return (
                                <div key={rId} className="flex items-center gap-1.5 bg-base px-2 py-1 rounded border border-surface">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }}></div>
                                  <span className="text-xs text-text">{role.name}</span>
                                  {canManageRoles && (
                                    <button onClick={() => toggleMemberRole(memberKey, rId)} className="text-muted hover:text-red-500 ml-1">×</button>
                                  )}
                                </div>
                              );
                            })}
                            
                            {canManageRoles && (
                              <div className="relative">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenRoleMenu(openRoleMenu === memberKey ? null : memberKey);
                                  }}
                                  className="flex items-center justify-center w-6 h-6 rounded bg-base border border-surface text-muted hover:text-text hover:border-muted transition-colors"
                                >
                                  +
                                </button>
                                {openRoleMenu === memberKey && (
                                  <div 
                                    className="absolute left-0 top-full mt-1 bg-base border border-surface rounded shadow-xl p-1 flex flex-col w-32 z-10"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {roles.map(role => (
                                      <button 
                                        key={role.id} 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleMemberRole(memberKey, role.id);
                                          setOpenRoleMenu(null);
                                        }}
                                        className="text-left px-2 py-1.5 text-xs text-text hover:bg-panel rounded flex items-center gap-2"
                                      >
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }}></div>
                                        {role.name}
                                        {userRoles.includes(role.id) && <span className="ml-auto text-green-500">✓</span>}
                                      </button>
                                    ))}
                                    {roles.length === 0 && <span className="text-xs text-muted p-2">No roles available</span>}
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {canKickMembers && memberKey !== activeServerObj.owner && (
                              <button 
                                onClick={() => handleKickMember(memberKey)}
                                className="ml-auto text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded border border-red-500/30 hover:bg-red-500/10 transition-colors"
                              >
                                Kick
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            <div className="p-4 bg-base flex justify-end gap-3 border-t border-surface shrink-0">
              <button onClick={onClose} className="text-text hover:underline text-sm font-medium px-4 py-2">
                Cancel
              </button>
              <button onClick={handleSave} disabled={!serverName.trim()} className="bg-accent hover:opacity-90 text-white px-6 py-2.5 rounded text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                Save Changes
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}