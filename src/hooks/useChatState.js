import { useState, useEffect, useRef } from 'react';

// Avatars options for users
export const AVATARS = [
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Jack',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Luna',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Buddy',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Coco',
];

export default function useChatState() {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [joinRoomError, setJoinRoomError] = useState('');
  
  // Track read status: { [userId_roomId]: lastReadTimestamp }
  const [readStatuses, setReadStatuses] = useState({});

  const channelRef = useRef(null);

  // Load initial data from localStorage
  useEffect(() => {
    // Helper to initialize local storage lists
    if (!localStorage.getItem('simple_chat_users')) {
      localStorage.setItem('simple_chat_users', JSON.stringify([]));
    }
    if (!localStorage.getItem('simple_chat_rooms')) {
      localStorage.setItem('simple_chat_rooms', JSON.stringify([]));
    }
    if (!localStorage.getItem('simple_chat_messages')) {
      localStorage.setItem('simple_chat_messages', JSON.stringify([]));
    }
    if (!localStorage.getItem('simple_chat_read_status')) {
      localStorage.setItem('simple_chat_read_status', JSON.stringify({}));
    }

    const savedUsers = JSON.parse(localStorage.getItem('simple_chat_users') || '[]');
    const savedRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
    const savedReadStatuses = JSON.parse(localStorage.getItem('simple_chat_read_status') || '{}');
    
    setUsers(savedUsers);
    setRooms(savedRooms);
    setReadStatuses(savedReadStatuses);

    // Identify current user for this specific browser tab using sessionStorage
    const sessionUserId = sessionStorage.getItem('simple_chat_current_user_id');
    if (sessionUserId) {
      const user = savedUsers.find(u => u.id === sessionUserId);
      if (user) {
        // Ensure user is marked online in localStorage when tab connects/refresh
        user.isOnline = true;
        const updatedUsers = savedUsers.map(u => u.id === user.id ? user : u);
        localStorage.setItem('simple_chat_users', JSON.stringify(updatedUsers));
        setUsers(updatedUsers);
        setCurrentUser(user);
      }
    }

    // Initialize BroadcastChannel for real-time inter-tab messaging
    channelRef.current = new BroadcastChannel('simple_chat_channel');

    // Listener for messages from other tabs
    channelRef.current.onmessage = (event) => {
      const { type, payload } = event.data;

      if (type === 'USER_UPDATED') {
        const freshUsers = JSON.parse(localStorage.getItem('simple_chat_users') || '[]');
        setUsers(freshUsers);
        
        // If our current user was updated (e.g. status toggled elsewhere or sync update)
        if (sessionUserId) {
          const me = freshUsers.find(u => u.id === sessionUserId);
          if (me) setCurrentUser(me);
        }
      } else if (type === 'ROOM_CREATED' || type === 'USER_JOINED') {
        const freshRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
        setRooms(freshRooms);
        // Refresh active room details if it's the one we have open
        if (activeRoom && payload.roomId === activeRoom.id) {
          const matched = freshRooms.find(r => r.id === activeRoom.id);
          if (matched) setActiveRoom(matched);
        }
      } else if (type === 'MESSAGE_SENT') {
        const freshMessages = JSON.parse(localStorage.getItem('simple_chat_messages') || '[]');
        // Update local messages if it matches our active room
        if (activeRoom && payload.roomId === activeRoom.id) {
          const roomMsgs = freshMessages.filter(m => m.roomId === activeRoom.id);
          setMessages(roomMsgs);
          // Auto-mark as read
          markRoomAsRead(activeRoom.id, sessionUserId);
        } else {
          // Re-fetch read statuses to update badge counts in sidebar
          const freshReadStatuses = JSON.parse(localStorage.getItem('simple_chat_read_status') || '{}');
          setReadStatuses(freshReadStatuses);
        }
      } else if (type === 'ROOM_DELETED') {
        const freshRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
        setRooms(freshRooms);
        // If our active room was deleted, kick us back to dashboard empty state
        if (activeRoom && activeRoom.id === payload.roomId) {
          setActiveRoom(null);
          alert('This chat room has been deleted by an administrator.');
        }
      } else if (type === 'MESSAGE_DELETED') {
        const freshMessages = JSON.parse(localStorage.getItem('simple_chat_messages') || '[]');
        if (activeRoom && payload.roomId === activeRoom.id) {
          const roomMsgs = freshMessages.filter(m => m.roomId === activeRoom.id);
          setMessages(roomMsgs);
        }
      } else if (type === 'USER_KICKED') {
        const freshRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
        setRooms(freshRooms);
        
        // If current user was kicked from their active room
        if (sessionUserId === payload.userId) {
          if (activeRoom && activeRoom.id === payload.roomId) {
            setActiveRoom(null);
            alert('You have been removed from this chat room by an administrator.');
          }
        } else if (activeRoom && activeRoom.id === payload.roomId) {
          // Refresh details of the room we are actively viewing (update member counts)
          const matched = freshRooms.find(r => r.id === activeRoom.id);
          if (matched) setActiveRoom(matched);
        }
      }
    };

    // Before tab closes, set this tab's user offline (optional, but let's allow manual toggle as it's easier to demonstrate)
    const handleBeforeUnload = () => {
      if (sessionUserId) {
        const freshUsers = JSON.parse(localStorage.getItem('simple_chat_users') || '[]');
        const updated = freshUsers.map(u => u.id === sessionUserId ? { ...u, isOnline: false } : u);
        localStorage.setItem('simple_chat_users', JSON.stringify(updated));
        channelRef.current?.postMessage({ type: 'USER_UPDATED', payload: { userId: sessionUserId } });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      channelRef.current?.close();
    };
  }, [activeRoom?.id]);

  // Load messages whenever activeRoom changes
  useEffect(() => {
    if (activeRoom) {
      const allMessages = JSON.parse(localStorage.getItem('simple_chat_messages') || '[]');
      const roomMsgs = allMessages.filter(m => m.roomId === activeRoom.id);
      setMessages(roomMsgs);

      if (currentUser) {
        markRoomAsRead(activeRoom.id, currentUser.id);
      }
    } else {
      setMessages([]);
    }
  }, [activeRoom, currentUser?.id]);

  // Register new user
  const registerUser = (username, avatar) => {
    if (username.toLowerCase().trim() === 'admin') {
      throw new Error("Username 'Admin' is reserved. Please use the Admin Login option instead.");
    }

    const trimmedUsername = username.trim();
    const savedUsers = JSON.parse(localStorage.getItem('simple_chat_users') || '[]');
    const existingUser = savedUsers.find(u => u.username.toLowerCase() === trimmedUsername.toLowerCase());

    let userToUse;
    if (existingUser) {
      // Log in as existing user
      existingUser.isOnline = true;
      existingUser.avatar = avatar; // Update avatar if they chose a new one
      userToUse = existingUser;
      
      const updatedUsers = savedUsers.map(u => u.id === existingUser.id ? existingUser : u);
      localStorage.setItem('simple_chat_users', JSON.stringify(updatedUsers));
      setUsers(updatedUsers);
    } else {
      // Register new user
      const userId = 'user_' + Math.random().toString(36).substr(2, 9);
      const newUser = {
        id: userId,
        username: trimmedUsername,
        avatar,
        isOnline: true,
        createdAt: Date.now(),
        isAdmin: false
      };
      savedUsers.push(newUser);
      localStorage.setItem('simple_chat_users', JSON.stringify(savedUsers));
      userToUse = newUser;
      setUsers(savedUsers);
    }
    
    sessionStorage.setItem('simple_chat_current_user_id', userToUse.id);
    setCurrentUser(userToUse);

    // Notify other tabs
    channelRef.current?.postMessage({ type: 'USER_UPDATED', payload: userToUse });
    return userToUse;
  };

  // Login as Admin
  const loginAdmin = (avatar, passwordInput, securityAnswerInput) => {
    setJoinRoomError('');
    if (passwordInput !== '6203351') {
      setJoinRoomError('Incorrect Admin password. Please try again.');
      return false;
    }

    if (!securityAnswerInput || securityAnswerInput.toLowerCase().trim() !== 'amarjeet') {
      setJoinRoomError('Incorrect security code answer.');
      return false;
    }

    const adminId = 'admin_user';
    const adminUser = {
      id: adminId,
      username: 'Admin',
      avatar,
      isOnline: true,
      isAdmin: true,
      createdAt: Date.now()
    };

    const savedUsers = JSON.parse(localStorage.getItem('simple_chat_users') || '[]');
    // Filter out previous admin entries to avoid duplicates
    const filtered = savedUsers.filter(u => u.id !== adminId);
    filtered.push(adminUser);
    localStorage.setItem('simple_chat_users', JSON.stringify(filtered));

    sessionStorage.setItem('simple_chat_current_user_id', adminId);
    setUsers(filtered);
    setCurrentUser(adminUser);

    channelRef.current?.postMessage({ type: 'USER_UPDATED', payload: adminUser });
    return adminUser;
  };

  // Toggle user online/offline status manually (perfect for testing offline functionality!)
  const toggleOnlineStatus = () => {
    if (!currentUser) return;
    
    const newStatus = !currentUser.isOnline;
    const freshUsers = JSON.parse(localStorage.getItem('simple_chat_users') || '[]');
    const updatedUsers = freshUsers.map(u => 
      u.id === currentUser.id ? { ...u, isOnline: newStatus } : u
    );
    
    localStorage.setItem('simple_chat_users', JSON.stringify(updatedUsers));
    setUsers(updatedUsers);
    
    const updatedMe = { ...currentUser, isOnline: newStatus };
    setCurrentUser(updatedMe);

    // Notify other tabs
    channelRef.current?.postMessage({ type: 'USER_UPDATED', payload: updatedMe });
  };

  // Create a chat room with a password
  const createRoom = (roomName, password) => {
    if (!currentUser) return null;

    const trimmedName = roomName.trim();
    const savedRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
    
    // Check if room with same name exists (case-insensitive)
    const roomExists = savedRooms.some(r => r.name.toLowerCase() === trimmedName.toLowerCase());
    if (roomExists) {
      throw new Error(`A room with the name "${trimmedName}" already exists. Please choose a different name.`);
    }

    const roomId = 'room_' + Math.random().toString(36).substr(2, 9);
    const newRoom = {
      id: roomId,
      name: trimmedName,
      password: password || '', // optional or empty means no password
      creatorId: currentUser.id,
      createdBy: currentUser.username,
      members: [currentUser.id]
    };

    savedRooms.push(newRoom);
    localStorage.setItem('simple_chat_rooms', JSON.stringify(savedRooms));

    setRooms(savedRooms);
    setActiveRoom(newRoom);

    // Notify other tabs
    channelRef.current?.postMessage({ type: 'ROOM_CREATED', payload: newRoom });
    return newRoom;
  };

  // Verify room password and join the room
  const joinRoomWithPassword = (roomId, passwordInput, userObject = currentUser) => {
    setJoinRoomError('');
    const savedRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
    const room = savedRooms.find(r => r.id === roomId);

    if (!room) {
      setJoinRoomError('Room not found.');
      return false;
    }

    // Bypass check: Admin can enter any room without password!
    const isUserAdmin = userObject?.isAdmin === true;

    if (!isUserAdmin && room.password && room.password !== passwordInput) {
      setJoinRoomError('Incorrect password. Please try again.');
      return false;
    }

    // Join room if not already a member
    if (userObject && !room.members.includes(userObject.id)) {
      room.members.push(userObject.id);
      const updatedRooms = savedRooms.map(r => r.id === roomId ? room : r);
      localStorage.setItem('simple_chat_rooms', JSON.stringify(updatedRooms));
      setRooms(updatedRooms);

      // Notify other tabs that user joined
      channelRef.current?.postMessage({ type: 'USER_JOINED', payload: { roomId, userId: userObject.id } });
    }

    setActiveRoom(room);
    return room;
  };

  // Delete room (Admin or Room Creator)
  const deleteRoom = (roomId) => {
    if (!currentUser) return;

    const savedRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
    const room = savedRooms.find(r => r.id === roomId);
    if (!room) return;

    // Only creator or admin can delete room
    const isCreator = room.creatorId === currentUser.id;
    if (!currentUser.isAdmin && !isCreator) {
      alert("You do not have permission to delete this room.");
      return;
    }

    const filteredRooms = savedRooms.filter(r => r.id !== roomId);
    localStorage.setItem('simple_chat_rooms', JSON.stringify(filteredRooms));
    setRooms(filteredRooms);

    // Clear messages for this room
    const allMessages = JSON.parse(localStorage.getItem('simple_chat_messages') || '[]');
    const filteredMessages = allMessages.filter(m => m.roomId !== roomId);
    localStorage.setItem('simple_chat_messages', JSON.stringify(filteredMessages));

    if (activeRoom && activeRoom.id === roomId) {
      setActiveRoom(null);
    }

    // Notify other tabs
    channelRef.current?.postMessage({ type: 'ROOM_DELETED', payload: { roomId } });
  };

  // Admin moderation: Delete individual message
  const deleteMessage = (messageId) => {
    if (!currentUser?.isAdmin) return;

    const allMessages = JSON.parse(localStorage.getItem('simple_chat_messages') || '[]');
    const targetMsg = allMessages.find(m => m.id === messageId);
    if (!targetMsg) return;

    const filteredMessages = allMessages.filter(m => m.id !== messageId);
    localStorage.setItem('simple_chat_messages', JSON.stringify(filteredMessages));

    if (activeRoom && activeRoom.id === targetMsg.roomId) {
      setMessages(filteredMessages.filter(m => m.roomId === activeRoom.id));
    }

    // Notify other tabs
    channelRef.current?.postMessage({ type: 'MESSAGE_DELETED', payload: { messageId, roomId: targetMsg.roomId } });
  };

  // Admin moderation: Remove/Kick user from room
  const kickUser = (userId, roomId) => {
    if (!currentUser?.isAdmin) return;

    const savedRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
    const room = savedRooms.find(r => r.id === roomId);
    if (!room) return;

    room.members = room.members.filter(id => id !== userId);
    const updatedRooms = savedRooms.map(r => r.id === roomId ? room : r);
    localStorage.setItem('simple_chat_rooms', JSON.stringify(updatedRooms));
    setRooms(updatedRooms);

    if (activeRoom && activeRoom.id === roomId) {
      setActiveRoom(room);
    }

    // Notify other tabs
    channelRef.current?.postMessage({ type: 'USER_KICKED', payload: { userId, roomId } });
  };

  // Send message (text, base64 image, and optional reply metadata)
  const sendMessage = (text, image = null, replyTo = null, senderOverride = null) => {
    if (!currentUser || !activeRoom) return;

    const sender = senderOverride || currentUser;

    const newMessage = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      roomId: activeRoom.id,
      senderId: sender.id,
      senderName: sender.username,
      senderAvatar: sender.avatar,
      text,
      image, // Base64 data URL
      replyTo, // null or { id, senderName, text }
      timestamp: Date.now()
    };

    const allMessages = JSON.parse(localStorage.getItem('simple_chat_messages') || '[]');
    allMessages.push(newMessage);
    localStorage.setItem('simple_chat_messages', JSON.stringify(allMessages));

    setMessages(prev => [...prev, newMessage]);
    
    // Update read status for sender
    markRoomAsRead(activeRoom.id, currentUser.id);

    // Notify other tabs (if they are online, they'll receive this)
    channelRef.current?.postMessage({ type: 'MESSAGE_SENT', payload: newMessage });
  };

  // Helper to mark a room as read for a user
  const markRoomAsRead = (roomId, userId) => {
    if (!roomId || !userId) return;
    const key = `${userId}_${roomId}`;
    const freshReadStatuses = JSON.parse(localStorage.getItem('simple_chat_read_status') || '{}');
    freshReadStatuses[key] = Date.now();
    localStorage.setItem('simple_chat_read_status', JSON.stringify(freshReadStatuses));
    setReadStatuses(freshReadStatuses);
  };

  // Calculate unread messages for a room for the current user
  const getUnreadCount = (roomId) => {
    if (!currentUser || !roomId) return 0;
    
    // If we are currently in this active room, unread count is 0
    if (activeRoom && activeRoom.id === roomId) return 0;

    const key = `${currentUser.id}_${roomId}`;
    const lastRead = readStatuses[key] || 0;

    const allMessages = JSON.parse(localStorage.getItem('simple_chat_messages') || '[]');
    const roomMessages = allMessages.filter(m => m.roomId === roomId);
    
    // Count messages sent after lastRead, excluding our own messages
    const unread = roomMessages.filter(m => m.timestamp > lastRead && m.senderId !== currentUser.id);
    return unread.length;
  };

  return {
    currentUser,
    users,
    rooms,
    messages,
    activeRoom,
    joinRoomError,
    registerUser,
    loginAdmin,
    toggleOnlineStatus,
    createRoom,
    joinRoomWithPassword,
    deleteRoom,
    deleteMessage,
    kickUser,
    sendMessage,
    getUnreadCount,
    setActiveRoom
  };
}
