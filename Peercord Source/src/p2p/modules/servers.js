const b4a = window.require('b4a');
import { generateUUID, sodium } from '../utils.js';

export async function createServer(network, name, icon, allowAnyoneToInvite, isGroupChat = false) {
  const topic = b4a.alloc(32);
  sodium.randombytes_buf(topic);
  const topicHex = b4a.toString(topic, 'hex');

  const channels = { 
    text: ['general-chat'], 
    voice: ['general-voice'], 
    permissions: { 'general-chat': ['role_members'], 'general-voice': ['role_members'] }, 
    send_permissions: { 'general-chat': ['role_members'], 'general-voice': ['role_members'] } 
  };
  
  // Default roles and permissions setup
  const roles = [
    { 
      id: 'admin', 
      name: 'Admin', 
      color: '#ff4444', 
      permissions: ['admin', 'send_messages', 'read_messages', 'manage_channels', 'manage_roles', 'kick_members', 'send_files', 'add_reactions', 'mention_everyone'] 
    },
    { 
      id: 'role_members', 
      name: 'Members', 
      color: '#9ca3af', 
      permissions: ['send_messages', 'read_messages', 'send_files', 'add_reactions'] 
    }
  ];
  const memberRoles = { [network.myKey]: ['admin', 'role_members'] };

  const serverInfo = { name, icon, owner: network.myKey, allowAnyoneToInvite, isGroupChat, channels, roles, memberRoles };
  
  network.servers.push({ topicHex, ...serverInfo });
  network._emitServers();

  await network.serverDb.put(topicHex, serverInfo);
  
  await network._joinTopic(topicHex);
  await network._appendSignedMessage({ type: 'server_join', serverTopicHex: topicHex, timestamp: Date.now() });
  
  return { topicHex, ...serverInfo };
}

export async function joinServer(network, topicHex, name, icon, owner, allowAnyoneToInvite, isGroupChat = false, channels = null, roles = null, memberRoles = null) {
  if (network.servers.some(s => s.topicHex === topicHex)) return;

  const serverInfo = { 
    name, 
    icon, 
    owner, 
    allowAnyoneToInvite, 
    isGroupChat, 
    channels: channels || { text: ['general-chat'], voice: ['general-voice'], permissions: { 'general-chat': ['role_members'], 'general-voice': ['role_members'] }, send_permissions: { 'general-chat': ['role_members'], 'general-voice': ['role_members'] } },
    roles: roles || [],
    memberRoles: memberRoles || {}
  };
  
  network.servers.push({ topicHex, ...serverInfo });
  network._emitServers();

  await network.serverDb.put(topicHex, serverInfo);

  await network._joinTopic(topicHex);
  await network._appendSignedMessage({ type: 'server_join', serverTopicHex: topicHex, timestamp: Date.now() });
  
  await network._reloadCores();
}

export async function deleteServer(network, topicHex) {
  await network._appendSignedMessage({ type: 'server_delete', serverTopicHex: topicHex, timestamp: Date.now() });
  await network._wipeLocalServerData(topicHex);
}

export async function leaveServer(network, topicHex) {
  await network._appendSignedMessage({ type: 'server_leave', serverTopicHex: topicHex, timestamp: Date.now() });
  await network._wipeLocalServerData(topicHex);
}

export async function sendServerInvite(network, targetKey, serverTopicHex) {
  const server = network.servers.find(s => s.topicHex === serverTopicHex);
  if (!server) return;

  await network._appendEncryptedMessage(targetKey, {
    id: generateUUID(),
    type: 'server_invite',
    timestamp: Date.now(),
    inviterName: network.displayName,
    serverName: server.name,
    serverIcon: server.icon,
    serverTopicHex: server.topicHex,
    serverOwner: server.owner, 
    allowAnyoneToInvite: server.allowAnyoneToInvite,
    isGroupChat: server.isGroupChat,
    channels: server.channels,
    roles: server.roles,
    memberRoles: server.memberRoles
  });
}

export async function sendGroupChatAdd(network, targetKey, serverTopicHex) {
  const server = network.servers.find(s => s.topicHex === serverTopicHex);
  if (!server) return;

  await network._appendEncryptedMessage(targetKey, {
    id: generateUUID(),
    type: 'group_chat_add',
    timestamp: Date.now(),
    topicHex: server.topicHex,
    name: server.name,
    icon: server.icon,
    owner: server.owner,
    channels: server.channels,
    roles: server.roles,
    memberRoles: server.memberRoles
  });
}

export async function updateServerSettings(network, serverTopicHex, name, icon, allowAnyoneToInvite, channels, roles, memberRoles) {
  await network._appendSignedMessage({ 
    type: 'server_settings_update', 
    serverTopicHex, 
    name, 
    icon, 
    allowAnyoneToInvite, 
    channels,
    roles,
    memberRoles,
    timestamp: Date.now() 
  });
  
  const server = network.servers.find(s => s.topicHex === serverTopicHex);
  if (server) {
    if (name !== undefined) server.name = name;
    if (icon !== undefined) server.icon = icon;
    if (allowAnyoneToInvite !== undefined) server.allowAnyoneToInvite = allowAnyoneToInvite;
    if (channels !== undefined) server.channels = channels;
    if (roles !== undefined) server.roles = roles;
    if (memberRoles !== undefined) server.memberRoles = memberRoles;
    await network.serverDb.put(serverTopicHex, server);
    network._emitServers();
  }
}