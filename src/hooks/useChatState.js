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

// Helper to upload a base64 image file to ntfy.sh as an attachment using PUT
const uploadBase64ToNtfy = async (base64Data, topic) => {
  try {
    const parts = base64Data.split(';base64,');
    if (parts.length < 2) return null;
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    const blob = new Blob([uInt8Array], { type: contentType });
    const fileExtension = contentType.split('/')[1] || 'png';
    const filename = `image_${Date.now()}.${fileExtension}`;

    const response = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'PUT',
      body: blob,
      headers: {
        'Filename': filename,
        'Content-Type': contentType
      }
    });

    if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);
    const responseData = await response.json();
    return responseData.attachment?.url;
  } catch (err) {
    console.error('Error uploading image to ntfy:', err);
    return null;
  }
};

export default function useChatState() {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [joinRoomError, setJoinRoomError] = useState('');
  const [urlRoomId, setUrlRoomId] = useState('');
  const [urlRoomDetails, setUrlRoomDetails] = useState(null);
  
  // Track read status: { [userId_roomId]: lastReadTimestamp }
  const [readStatuses, setReadStatuses] = useState({});

  const channelRef = useRef(null);

  // Load initial data from localStorage
  useEffect(() => {
    // Initialize BroadcastChannel early for real-time inter-tab messaging
    channelRef.current = new BroadcastChannel('simple_chat_channel');

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

    let savedUsers = JSON.parse(localStorage.getItem('simple_chat_users') || '[]');
    let savedRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
    const savedReadStatuses = JSON.parse(localStorage.getItem('simple_chat_read_status') || '{}');

    // Parse URL query parameters for connection link: ?join=base64Data or ?room=roomId
    const params = new URLSearchParams(window.location.search);
    const joinData = params.get('join');
    const roomIdParam = params.get('room');

    let roomId = roomIdParam || '';
    let roomDetails = null;

    if (joinData) {
      try {
        const binString = atob(joinData);
        const uint8 = new Uint8Array(binString.length);
        for (let i = 0; i < binString.length; i++) {
          uint8[i] = binString.charCodeAt(i);
        }
        const decodedString = new TextDecoder().decode(uint8);
        const importedRoom = JSON.parse(decodedString);
        
        if (importedRoom && importedRoom.id && importedRoom.name) {
          roomId = importedRoom.id;
          roomDetails = importedRoom;

          // Save this imported room to local storage if it doesn't exist
          const existingRoomIndex = savedRooms.findIndex(r => r.id === roomId);
          if (existingRoomIndex === -1) {
            savedRooms.push(importedRoom);
            localStorage.setItem('simple_chat_rooms', JSON.stringify(savedRooms));
            // Send BroadcastChannel notification to other tabs
            channelRef.current?.postMessage({ type: 'ROOM_CREATED', payload: importedRoom });
          } else {
            // Update details (e.g. password, creator name) but keep members merged
            const existingRoom = savedRooms[existingRoomIndex];
            const mergedMembers = Array.from(new Set([...existingRoom.members, ...importedRoom.members]));
            savedRooms[existingRoomIndex] = {
              ...existingRoom,
              name: importedRoom.name,
              password: importedRoom.password,
              createdBy: importedRoom.createdBy,
              creatorId: importedRoom.creatorId,
              members: mergedMembers
            };
            localStorage.setItem('simple_chat_rooms', JSON.stringify(savedRooms));
            roomDetails = savedRooms[existingRoomIndex];
          }
        }
      } catch (err) {
        console.error('Error parsing join room link:', err);
      }
    } else if (roomId) {
      roomDetails = savedRooms.find(r => r.id === roomId);
    }
    
    setUsers(savedUsers);
    setRooms(savedRooms);
    setReadStatuses(savedReadStatuses);

    if (roomId && roomDetails) {
      setUrlRoomId(roomId);
      setUrlRoomDetails(roomDetails);
    }

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

  // Helper to publish events to a public keyless pub-sub topic on ntfy.sh
  const publishToNtfy = (roomId, type, payload) => {
    fetch(`https://ntfy.sh/ntfy_vibe_chat_room_${roomId}`, {
      method: 'POST',
      body: JSON.stringify({ type, payload })
    }).catch(err => console.error('Error publishing to ntfy:', err));
  };

  // Helper to publish events to the global rooms topic on ntfy.sh
  const publishToNtfyGlobal = (type, payload) => {
    fetch(`https://ntfy.sh/ntfy_vibe_chat_global_rooms`, {
      method: 'POST',
      body: JSON.stringify({ type, payload })
    }).catch(err => console.error('Error publishing to global ntfy:', err));
  };

  // Real-time synchronization of the global rooms list
  useEffect(() => {
    const syncGlobalRoomsHistory = async () => {
      try {
        const response = await fetch('https://ntfy.sh/ntfy_vibe_chat_global_rooms/json?poll=1&since=all');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const text = await response.text();
        if (!text) return;
        
        const lines = text.trim().split('\n');
        const savedRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
        let updated = [...savedRooms];
        let changed = false;

        lines.forEach(line => {
          try {
            const ntfyData = JSON.parse(line);
            if (ntfyData.event === 'message') {
              const data = JSON.parse(ntfyData.message);
              if (data.type === 'ROOM_CREATED') {
                const room = data.payload;
                const existsIdx = updated.findIndex(r => r.id === room.id);
                if (existsIdx === -1) {
                  updated.push(room);
                  changed = true;
                } else {
                  const mergedMembers = Array.from(new Set([...updated[existsIdx].members, ...room.members]));
                  updated[existsIdx] = {
                    ...updated[existsIdx],
                    ...room,
                    members: mergedMembers
                  };
                  changed = true;
                }
              } else if (data.type === 'ROOM_DELETED') {
                const { roomId } = data.payload;
                const existsIdx = updated.findIndex(r => r.id === roomId);
                if (existsIdx !== -1) {
                  updated = updated.filter(r => r.id !== roomId);
                  changed = true;
                }
              }
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }
        });

        if (changed) {
          localStorage.setItem('simple_chat_rooms', JSON.stringify(updated));
          setRooms(updated);
        }
      } catch (err) {
        console.error('Error syncing global rooms history:', err);
      }
    };

    syncGlobalRoomsHistory();

    const eventSource = new EventSource('https://ntfy.sh/ntfy_vibe_chat_global_rooms/sse');

    eventSource.onmessage = (event) => {
      try {
        const ntfyData = JSON.parse(event.data);
        if (ntfyData.event === 'message') {
          const data = JSON.parse(ntfyData.message);
          const { type, payload } = data;

          if (type === 'ROOM_CREATED') {
            const freshRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
            const existsIdx = freshRooms.findIndex(r => r.id === payload.id);
            if (existsIdx === -1) {
              freshRooms.push(payload);
              localStorage.setItem('simple_chat_rooms', JSON.stringify(freshRooms));
              setRooms(freshRooms);
            } else {
              const mergedMembers = Array.from(new Set([...freshRooms[existsIdx].members, ...payload.members]));
              freshRooms[existsIdx] = {
                ...freshRooms[existsIdx],
                ...payload,
                members: mergedMembers
              };
              localStorage.setItem('simple_chat_rooms', JSON.stringify(freshRooms));
              setRooms(freshRooms);
            }
          } else if (type === 'ROOM_DELETED') {
            const freshRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
            const filtered = freshRooms.filter(r => r.id !== payload.roomId);
            localStorage.setItem('simple_chat_rooms', JSON.stringify(filtered));
            setRooms(filtered);
            if (activeRoom && activeRoom.id === payload.roomId) {
              setActiveRoom(null);
              alert('This chat room has been deleted.');
            }
          }
        }
      } catch (e) {
        console.error('Error handling global SSE event:', e);
      }
    };

    eventSource.onerror = (err) => {
      console.error('Global EventSource error:', err);
    };

    return () => {
      eventSource.close();
    };
  }, [activeRoom?.id]);

  // Real-time synchronization via public ntfy EventSource (SSE)

  useEffect(() => {
    if (!activeRoom) return;

    const topic = `ntfy_vibe_chat_room_${activeRoom.id}`;
    let eventSource;

    const connect = () => {
      eventSource = new EventSource(`https://ntfy.sh/${topic}/sse`);

      eventSource.onmessage = (event) => {
        try {
          const ntfyData = JSON.parse(event.data);
          if (ntfyData.event === 'message') {
            const data = JSON.parse(ntfyData.message);
            const { type, payload } = data;

            if (type === 'NEW_MESSAGE') {
              const freshMessages = JSON.parse(localStorage.getItem('simple_chat_messages') || '[]');
              const messageExists = freshMessages.some(m => m.id === payload.id);
              if (!messageExists) {
                freshMessages.push(payload);
                localStorage.setItem('simple_chat_messages', JSON.stringify(freshMessages));
                
                // Only update messages state if it belongs to the active room
                setMessages(prev => {
                  if (prev.some(m => m.id === payload.id)) return prev;
                  return [...prev, payload];
                });
                
                if (currentUser) {
                  // Mark as read
                  const key = `${currentUser.id}_${activeRoom.id}`;
                  const freshReadStatuses = JSON.parse(localStorage.getItem('simple_chat_read_status') || '{}');
                  freshReadStatuses[key] = Date.now();
                  localStorage.setItem('simple_chat_read_status', JSON.stringify(freshReadStatuses));
                  setReadStatuses(freshReadStatuses);
                }
              }
            } else if (type === 'MESSAGE_DELETED') {
              const freshMessages = JSON.parse(localStorage.getItem('simple_chat_messages') || '[]');
              const filtered = freshMessages.filter(m => m.id !== payload.messageId);
              localStorage.setItem('simple_chat_messages', JSON.stringify(filtered));
              setMessages(prev => prev.filter(m => m.id !== payload.messageId));
            } else if (type === 'USER_KICKED') {
              if (currentUser && currentUser.id === payload.userId) {
                setActiveRoom(null);
                alert('You have been removed from this chat room by an administrator.');
              } else {
                const freshRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
                const matchedIndex = freshRooms.findIndex(r => r.id === activeRoom.id);
                if (matchedIndex !== -1) {
                  const room = freshRooms[matchedIndex];
                  room.members = room.members.filter(id => id !== payload.userId);
                  localStorage.setItem('simple_chat_rooms', JSON.stringify(freshRooms));
                  setRooms(freshRooms);
                  setActiveRoom({ ...room });
                }
              }
            } else if (type === 'ROOM_DELETED') {
              const freshRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
              const filtered = freshRooms.filter(r => r.id !== payload.roomId);
              localStorage.setItem('simple_chat_rooms', JSON.stringify(filtered));
              setRooms(filtered);
              setActiveRoom(null);
              alert('This chat room has been deleted by an administrator.');
            } else if (type === 'USER_JOINED') {
              const freshRooms = JSON.parse(localStorage.getItem('simple_chat_rooms') || '[]');
              const matchedIndex = freshRooms.findIndex(r => r.id === payload.roomId);
              if (matchedIndex !== -1) {
                const room = freshRooms[matchedIndex];
                if (!room.members.includes(payload.userId)) {
                  room.members.push(payload.userId);
                  localStorage.setItem('simple_chat_rooms', JSON.stringify(freshRooms));
                  setRooms(freshRooms);
                  if (activeRoom && activeRoom.id === payload.roomId) {
                    setActiveRoom({ ...room });
                  }
                }
              }

              // Save guest profile so it displays their name and avatar
              if (payload.userObject) {
                const freshUsers = JSON.parse(localStorage.getItem('simple_chat_users') || '[]');
                const userExists = freshUsers.some(u => u.id === payload.userObject.id);
                if (!userExists) {
                  freshUsers.push(payload.userObject);
                  localStorage.setItem('simple_chat_users', JSON.stringify(freshUsers));
                  setUsers(freshUsers);
                }
              }
            }
          }
        } catch (err) {
          console.error('Error handling SSE message:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource error:', err);
      };
    };

    connect();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [activeRoom?.id, currentUser?.id]);

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

    // Publish to global room list
    publishToNtfyGlobal('ROOM_CREATED', newRoom);

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

      // Notify other devices in real-time
      publishToNtfy(roomId, 'USER_JOINED', { roomId, userId: userObject.id, userObject });
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

    // Notify other devices
    publishToNtfy(roomId, 'ROOM_DELETED', { roomId });

    // Notify global rooms topic
    publishToNtfyGlobal('ROOM_DELETED', { roomId });
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

    // Notify other devices
    publishToNtfy(targetMsg.roomId, 'MESSAGE_DELETED', { messageId });
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

    // Notify other devices
    publishToNtfy(roomId, 'USER_KICKED', { userId });
  };

  // Send message (text, base64 image, and optional reply metadata)
  const sendMessage = async (text, image = null, replyTo = null, senderOverride = null) => {
    if (!currentUser || !activeRoom) return;

    const sender = senderOverride || currentUser;
    let imageUrl = image;

    const newMessageId = 'msg_' + Math.random().toString(36).substr(2, 9);
    const newMessage = {
      id: newMessageId,
      roomId: activeRoom.id,
      senderId: sender.id,
      senderName: sender.username,
      senderAvatar: sender.avatar,
      text,
      image: imageUrl, // Initially local Base64 URL
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

    // Upload to ntfy.sh if there is a base64 image
    if (image && image.startsWith('data:')) {
      try {
        const uploadedUrl = await uploadBase64ToNtfy(image, `ntfy_vibe_chat_room_${activeRoom.id}_files`);
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        }
      } catch (err) {
        console.error('Failed to upload image to ntfy:', err);
      }
    }

    // Publish to other devices with the remote URL reference
    const ntfyMessage = {
      ...newMessage,
      image: imageUrl
    };
    publishToNtfy(activeRoom.id, 'NEW_MESSAGE', ntfyMessage);
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
    setActiveRoom,
    urlRoomId,
    urlRoomDetails,
    setUrlRoomId,
    setUrlRoomDetails,
    setJoinRoomError
  };
}
