import { useState, useEffect, useRef } from 'react';
import useChatState, { AVATARS } from './hooks/useChatState';
import { 
  Send, 
  Image as ImageIcon, 
  Lock, 
  Unlock, 
  Copy, 
  Plus, 
  MessageSquare, 
  User, 
  X, 
  AlertTriangle,
  Radio,
  Wifi,
  WifiOff,
  Trash2,
  CornerUpLeft,
  UserMinus,
  ShieldAlert,
  ArrowLeft,
  Search
} from 'lucide-react';

function App() {
  const {
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
    setUrlRoomDetails
  } = useChatState();

  // Username and Avatar selection inputs
  const [usernameInput, setUsernameInput] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);

  // Admin login toggle & inputs
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminSecurityInput, setAdminSecurityInput] = useState('');
  const [registerError, setRegisterError] = useState('');

  // Join Room via link states
  const [roomPasswordInput, setRoomPasswordInput] = useState('');
  const [roomToVerify, setRoomToVerify] = useState(null);

  // New room inputs
  const [roomNameInput, setRoomNameInput] = useState('');
  const [roomPasswordSet, setRoomPasswordSet] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [roomCreationError, setRoomCreationError] = useState('');
  const [roomSearchQuery, setRoomSearchQuery] = useState('');

  // Message inputs
  const [messageText, setMessageText] = useState('');
  const [attachedImage, setAttachedImage] = useState(null);
  const [imageFileName, setImageFileName] = useState('');
  const [replyTo, setReplyTo] = useState(null); // stores { id, senderName, text }
  const [impersonateUserId, setImpersonateUserId] = useState('');

  // UI state
  const [isCopied, setIsCopied] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);

  // Active users restricted to current room (excluding admin)
  const displayActiveUsers = (activeRoom && currentUser)
    ? users.filter(u => u.id !== currentUser.id && !u.isAdmin && u.isOnline && activeRoom.members.includes(u.id))
    : [];

  // Filtered rooms list for all users based on search query
  const displayRooms = rooms.filter(room =>
    room.name.toLowerCase().includes(roomSearchQuery.toLowerCase())
  );

  // Reset impersonation select when activeRoom changes
  useEffect(() => {
    if (currentUser?.isAdmin) {
      setImpersonateUserId(currentUser.id);
    }
  }, [activeRoom, currentUser]);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Handle auto-joining of room from invite link if user is already logged in
  useEffect(() => {
    if (currentUser && urlRoomId && urlRoomDetails) {
      const isAlreadyMember = urlRoomDetails.members.includes(currentUser.id);
      if (isAlreadyMember || !urlRoomDetails.password) {
        joinRoomWithPassword(urlRoomId, '', currentUser);
        window.history.replaceState({}, document.title, window.location.pathname);
        setUrlRoomId('');
        setUrlRoomDetails(null);
      }
    }
  }, [currentUser, urlRoomId, urlRoomDetails, joinRoomWithPassword, setUrlRoomId, setUrlRoomDetails]);

  // Auto-scroll messages to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle user registration / admin login form submit
  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    setRegisterError('');

    if (isAdminLogin) {
      const admin = loginAdmin(selectedAvatar, adminPasswordInput, adminSecurityInput);
      if (admin) {
        // If we have a pending room from URL, join it (admin bypasses passwords!)
        if (urlRoomId && urlRoomDetails) {
          joinRoomWithPassword(urlRoomId, '', admin);
          window.history.replaceState({}, document.title, window.location.pathname);
          setUrlRoomId('');
          setUrlRoomDetails(null);
        }
      }
    } else {
      if (!usernameInput.trim()) return;
      try {
        const registeredUser = registerUser(usernameInput.trim(), selectedAvatar);
        
        // If we have a pending room from URL parameter, try joining it
        if (urlRoomId && urlRoomDetails) {
          // If room has no password, join immediately
          if (!urlRoomDetails.password) {
            joinRoomWithPassword(urlRoomId, '', registeredUser);
            window.history.replaceState({}, document.title, window.location.pathname);
            setUrlRoomId('');
            setUrlRoomDetails(null);
          }
        }
      } catch (err) {
        setRegisterError(err.message);
      }
    }
  };

  // Handle password submission for URL room link
  const handleVerifyPasswordSubmit = (e) => {
    e.preventDefault();
    if (!urlRoomId) return;

    const joined = joinRoomWithPassword(urlRoomId, roomPasswordInput, currentUser);
    if (joined) {
      // Clear password states and query param after successful join
      setRoomPasswordInput('');
      setUrlRoomId('');
      setUrlRoomDetails(null);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  // Handle creating a new chat room
  const handleCreateRoomSubmit = (e) => {
    e.preventDefault();
    if (!roomNameInput.trim()) return;
    setRoomCreationError('');

    try {
      createRoom(roomNameInput.trim(), roomPasswordSet.trim());
      setRoomNameInput('');
      setRoomPasswordSet('');
      setShowCreateForm(false);
    } catch (err) {
      setRoomCreationError(err.message);
    }
  };

  // Copy share link to clipboard
  const handleCopyLink = () => {
    if (!activeRoom) return;
    try {
      const roomData = {
        id: activeRoom.id,
        name: activeRoom.name,
        password: activeRoom.password || '',
        createdBy: activeRoom.createdBy,
        creatorId: activeRoom.creatorId,
        members: activeRoom.members
      };
      
      const jsonStr = JSON.stringify(roomData);
      const uint8 = new TextEncoder().encode(jsonStr);
      let binString = "";
      for (let i = 0; i < uint8.length; i++) {
        binString += String.fromCharCode(uint8[i]);
      }
      const encodedData = btoa(binString);
      const shareUrl = `${window.location.origin}${window.location.pathname}?join=${encodedData}`;
      console.log('Generated Invite Link:', shareUrl);

      navigator.clipboard.writeText(shareUrl).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      });
    } catch (err) {
      console.error('Error generating invite link:', err);
    }
  };

  // Handle Image attachment file picker changes
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImageFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachedImage(reader.result); // Base64 encoding
    };
    reader.readAsDataURL(file);
  };

  // Remove attached image before sending
  const handleRemoveAttachment = () => {
    setAttachedImage(null);
    setImageFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle sending a message
  const handleSendMessageSubmit = (e) => {
    e.preventDefault();
    if (!messageText.trim() && !attachedImage) return;

    // Package reply context if replying
    const replyMeta = replyTo 
      ? { id: replyTo.id, senderName: replyTo.senderName, text: replyTo.text || "📷 Image" } 
      : null;

    // Impersonation check
    let senderOverride = null;
    if (currentUser.isAdmin && impersonateUserId && impersonateUserId !== currentUser.id) {
      const found = users.find(u => u.id === impersonateUserId);
      if (found) {
        senderOverride = found;
      }
    }

    sendMessage(messageText.trim(), attachedImage, replyMeta, senderOverride);
    setMessageText('');
    setAttachedImage(null);
    setImageFileName('');
    setReplyTo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Render welcome registration screen if not logged in
  if (!currentUser) {
    return (
      <div className="full-screen-container">
        <div className="auth-card">
          <div>
            <h1 className="auth-title">VibeChat</h1>
            <p className="auth-subtitle">
              {isAdminLogin ? "Access administrator credentials" : "Create your account to start chatting"}
            </p>
          </div>
          
          <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            
             {/* Admin toggle link */}
             <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
               <a
                 href="#"
                 onClick={(e) => {
                   e.preventDefault();
                   setIsAdminLogin(!isAdminLogin);
                   setRegisterError('');
                   setJoinRoomError('');
                 }}
                 className="admin-toggle-link"
                 style={{
                   color: '#ffffff',
                   textDecoration: 'underline',
                   cursor: 'pointer',
                   fontSize: '14px',
                   fontWeight: '500'
                 }}
               >
                 Welcome
               </a>
             </div>

            {isAdminLogin ? (
              // Admin login password and security inputs
              <>
                <div className="auth-form-group">
                  <label htmlFor="adminPassword">Enter Admin Password</label>
                  <input
                    id="adminPassword"
                    type="password"
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="Enter admin password..."
                    required
                  />
                </div>
                <div className="auth-form-group">
                  <label htmlFor="adminSecurity">Security Question: Aaj keya hai?</label>
                  <input
                    id="adminSecurity"
                    type="text"
                    value={adminSecurityInput}
                    onChange={(e) => setAdminSecurityInput(e.target.value)}
                    placeholder="Answer..."
                    required
                  />
                </div>
              </>
            ) : (
              // Standard Username input
              <div className="auth-form-group">
                <label htmlFor="username">Choose your display name</label>
                <input
                  id="username"
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter your name..."
                  required
                  maxLength={20}
                />
              </div>
            )}

            <div className="auth-form-group">
              <label>Select your avatar</label>
              <div className="avatar-selection-grid">
                {AVATARS.map((avatar, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`avatar-option-btn ${selectedAvatar === avatar ? 'selected' : ''}`}
                    onClick={() => setSelectedAvatar(avatar)}
                  >
                    <img src={avatar} alt={`Avatar option ${idx + 1}`} className="avatar-option-img" />
                  </button>
                ))}
              </div>
            </div>

            {registerError && (
              <div className="error-alert">
                <AlertTriangle size={16} />
                <span>{registerError}</span>
              </div>
            )}

            {isAdminLogin && joinRoomError && (
              <div className="error-alert">
                <AlertTriangle size={16} />
                <span>{joinRoomError}</span>
              </div>
            )}

            <button type="submit" className="primary-btn">
              {isAdminLogin ? <ShieldAlert size={18} /> : <User size={18} />} 
              {isAdminLogin ? "Authenticate Admin" : "Join VibeChat"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (roomToVerify) {
    const handleVerifyPasswordLocalSubmit = (e) => {
      e.preventDefault();
      const joined = joinRoomWithPassword(roomToVerify.id, roomPasswordInput, currentUser);
      if (joined) {
        setRoomToVerify(null);
        setRoomPasswordInput('');
        setJoinRoomError('');
      }
    };

    return (
      <div className="full-screen-container">
        <div className="auth-card">
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ margin: '0 auto', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '16px', borderRadius: '50%', width: 'fit-content' }}>
              <Lock size={32} />
            </div>
            <h1 className="auth-title" style={{ fontSize: '24px' }}>Password Protected Chat</h1>
            <p className="auth-subtitle">
              Enter the password to access <strong>{roomToVerify.name}</strong>.
            </p>
          </div>

          <form onSubmit={handleVerifyPasswordLocalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="auth-form-group">
              <label htmlFor="local-room-password">Enter Room Password</label>
              <input
                id="local-room-password"
                type="password"
                value={roomPasswordInput}
                onChange={(e) => setRoomPasswordInput(e.target.value)}
                placeholder="Password..."
                required
              />
            </div>

            {joinRoomError && (
              <div className="error-alert">
                <AlertTriangle size={16} />
                <span>{joinRoomError}</span>
              </div>
            )}

            <button type="submit" className="primary-btn">
              <Unlock size={18} /> Access Chat
            </button>
            
            <button 
              type="button" 
              className="form-btn cancel" 
              style={{ padding: '12px' }}
              onClick={() => {
                setRoomToVerify(null);
                setRoomPasswordInput('');
                setJoinRoomError('');
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render password locked prompt screen if we are joining a room via a link (Admin bypasses this screen!)
  const showPasswordScreen = urlRoomId && urlRoomDetails && urlRoomDetails.password && !currentUser.isAdmin;
  if (showPasswordScreen) {
    return (
      <div className="full-screen-container">
        <div className="auth-card">
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ margin: '0 auto', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '16px', borderRadius: '50%', width: 'fit-content' }}>
              <Lock size={32} />
            </div>
            <h1 className="auth-title" style={{ fontSize: '24px' }}>Password Protected Chat</h1>
            <p className="auth-subtitle">
              You are invited to join <strong>{urlRoomDetails.name}</strong> by {urlRoomDetails.createdBy}. Enter the password to access.
            </p>
          </div>

          <form onSubmit={handleVerifyPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="auth-form-group">
              <label htmlFor="room-password">Enter Room Password</label>
              <input
                id="room-password"
                type="password"
                value={roomPasswordInput}
                onChange={(e) => setRoomPasswordInput(e.target.value)}
                placeholder="Password..."
                required
              />
            </div>

            {joinRoomError && (
              <div className="error-alert">
                <AlertTriangle size={16} />
                <span>{joinRoomError}</span>
              </div>
            )}

            <button type="submit" className="primary-btn">
              <Unlock size={18} /> Access Chat
            </button>
            
            <button 
              type="button" 
              className="form-btn cancel" 
              style={{ padding: '12px' }}
              onClick={() => {
                setUrlRoomId('');
                setUrlRoomDetails(null);
                window.history.replaceState({}, document.title, window.location.pathname);
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Sidebar Area */}
      <aside className="sidebar">
        {/* Current logged in user profile card */}
        <div className="sidebar-user-card">
          <div className="user-profile-details">
            <div className="user-avatar-wrapper">
              <img src={currentUser.avatar} alt="My Avatar" className="user-avatar" />
              <span className={`status-dot ${currentUser.isOnline ? 'online' : 'offline'}`}></span>
            </div>
            <div className="item-info">
              <span className="user-meta-name" style={{ display: 'flex', alignItems: 'center' }}>
                {currentUser.username}
                {currentUser.isAdmin && <span className="admin-badge">Admin</span>}
              </span>
              <span className="user-meta-status-text">
                {currentUser.isOnline ? 'Active Now' : 'Appear Offline'}
              </span>
            </div>
          </div>

          <button 
            type="button" 
            className="status-toggle-btn"
            onClick={toggleOnlineStatus}
            title={currentUser.isOnline ? 'Go offline' : 'Go online'}
          >
            {currentUser.isOnline ? <Wifi size={14} style={{ color: 'var(--success)' }} /> : <WifiOff size={14} style={{ color: 'var(--danger)' }} />}
            Status
          </button>
        </div>

        {/* Sidebar Actions */}
        <div className="sidebar-action-area">
          {!showCreateForm ? (
            <button 
              type="button" 
              className="primary-btn" 
              onClick={() => setShowCreateForm(true)}
              style={{ width: '100%', padding: '10px' }}
            >
              <Plus size={16} /> Create Chat Room
            </button>
          ) : (
            <form onSubmit={handleCreateRoomSubmit} className="room-creation-form">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  value={roomNameInput}
                  onChange={(e) => setRoomNameInput(e.target.value)}
                  placeholder="Room name..."
                  required
                  maxLength={25}
                />
                <input
                  type="password"
                  value={roomPasswordSet}
                  onChange={(e) => setRoomPasswordSet(e.target.value)}
                  placeholder="Set lock password..."
                  required
                />
              </div>
              {roomCreationError && (
                <div className="error-alert" style={{ marginTop: '8px', padding: '8px 10px', fontSize: '11px' }}>
                  <AlertTriangle size={14} />
                  <span>{roomCreationError}</span>
                </div>
              )}
              <div className="room-creation-form-actions">
                <button 
                  type="button" 
                  className="form-btn cancel" 
                  onClick={() => {
                    setShowCreateForm(false);
                    setRoomNameInput('');
                    setRoomPasswordSet('');
                    setRoomCreationError('');
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="form-btn submit">
                  Create
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Chat Rooms Section */}
        <span className="sidebar-section-title">Chat Rooms</span>

        {/* Search Room Input */}
        <div className="sidebar-search-container" style={{ padding: '4px 16px 12px 16px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '26px', top: '42%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search rooms..."
            value={roomSearchQuery}
            onChange={(e) => setRoomSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 36px', fontSize: '13px', height: '36px', borderRadius: '8px' }}
          />
        </div>

        <div className="sidebar-list-container">
          {displayRooms.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
              No chat rooms joined yet.
            </div>
          ) : (
            displayRooms.map((room) => {
              const unread = getUnreadCount(room.id);
              const isRoomCreator = room.creatorId === currentUser.id;
              
              return (
                <div
                  key={room.id}
                  className={`list-item ${activeRoom?.id === room.id ? 'active' : ''}`}
                  onClick={() => {
                    if (room.password && !currentUser.isAdmin) {
                      setRoomToVerify(room);
                    } else {
                      // Join the room if not already a member
                      if (currentUser && !room.members.includes(currentUser.id)) {
                        joinRoomWithPassword(room.id, '', currentUser);
                      } else {
                        setActiveRoom(room);
                      }
                    }
                  }}
                  role="button"
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <div className="item-left-content">
                    <MessageSquare size={18} style={{ color: activeRoom?.id === room.id ? 'var(--primary)' : 'var(--text-secondary)' }} />
                    <div className="item-info">
                      <span className="item-title">{room.name}</span>
                      <span className="item-subtitle">by {room.createdBy}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                    {room.password && <Lock size={12} className="lock-icon" />}
                    {unread > 0 && <span className="unread-badge">{unread}</span>}
                    
                    {/* Admin or Room Creator Deletion Option */}
                    {(currentUser.isAdmin || isRoomCreator) && (
                      <button
                        type="button"
                        className="moderator-action-btn"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete room "${room.name}"? This kicks everyone out.`)) {
                            deleteRoom(room.id);
                          }
                        }}
                        title="Delete Room"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Active Users Section */}
        <span className="sidebar-section-title">Active Users ({displayActiveUsers.length})</span>
        <div className="sidebar-list-container" style={{ maxHeight: '180px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
          {displayActiveUsers.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
              {activeRoom ? "No active members in this room." : "Select a room to view members."}
            </div>
          ) : (
            displayActiveUsers.map((u) => {
              const isUserInActiveRoom = activeRoom && activeRoom.members.includes(u.id);
              return (
                <div key={u.id} className="list-item" style={{ cursor: 'default' }}>
                  <div className="item-left-content">
                    <div className="user-avatar-wrapper" style={{ width: '32px', height: '32px' }}>
                      <img src={u.avatar} alt={u.username} className="user-avatar" />
                      <span className={`status-dot ${u.isOnline ? 'online' : 'offline'}`} style={{ width: '10px', height: '10px' }}></span>
                    </div>
                    <div className="item-info">
                      <span className="item-title" style={{ fontSize: '13px', display: 'flex', alignItems: 'center' }}>
                        {u.username}
                      </span>
                      <span className="item-subtitle" style={{ fontSize: '10px' }}>
                        {u.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>

                  {/* Admin Kick User Control */}
                  {currentUser.isAdmin && isUserInActiveRoom && !u.isAdmin && (
                    <button
                      type="button"
                      className="moderator-action-btn"
                      onClick={() => {
                        if (confirm(`Kick ${u.username} from room "${activeRoom.name}"?`)) {
                          kickUser(u.id, activeRoom.id);
                        }
                      }}
                      title="Kick from Room"
                    >
                      <UserMinus size={13} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className={`chat-area ${activeRoom ? 'active' : ''}`}>
        {activeRoom ? (
          <>
            {/* Header info */}
            <div className="chat-header">
              <div className="chat-header-info">
                {/* Mobile Back Button */}
                <button 
                  type="button" 
                  className="mobile-back-btn" 
                  onClick={() => setActiveRoom(null)}
                  title="Back to rooms list"
                  style={{ display: 'none' }}
                >
                  <ArrowLeft size={20} />
                </button>

                <div style={{ background: 'var(--primary-glow)', color: 'var(--primary)', padding: '10px', borderRadius: '10px', flexShrink: 0 }}>
                  <Radio size={20} />
                </div>
                <div className="chat-header-title-wrapper" style={{ minWidth: 0, flex: 1 }}>
                  <h2 className="chat-header-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeRoom.name}</span>
                    {activeRoom.password && <Lock size={16} className="lock-icon" style={{ strokeWidth: '2.5px', flexShrink: 0 }} />}
                  </h2>
                  <p className="chat-header-subtitle" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px 0 0 0' }}>
                    Created by {activeRoom.createdBy} • {activeRoom.members.length} members joined
                  </p>
                </div>
              </div>

              <div className="chat-header-actions">
                {isCopied && <span className="copied-tooltip">Link copied!</span>}
                <button type="button" className="header-action-btn" onClick={handleCopyLink}>
                  <Copy size={14} /> <span className="invite-btn-text">Invite Link</span>
                </button>
              </div>
            </div>

            {/* Message Feed list */}
            <div className="chat-messages-container">
              {messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
                  <MessageSquare size={36} style={{ strokeWidth: '1.5px' }} />
                  <p style={{ margin: 0, fontSize: '14px' }}>This is the beginning of the room. Send a message to start.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === currentUser.id;
                  const timeString = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  
                  return (
                    <div key={msg.id} className={`message-row ${isMe ? 'sent' : 'received'}`}>
                      {!isMe && <img src={msg.senderAvatar || AVATARS[0]} alt={msg.senderName} className="message-avatar" />}
                      <div className="message-bubble-wrapper">
                        
                        {/* Hover Actions Menu */}
                        <div className="message-actions-overlay">
                          <button 
                            type="button" 
                            className="msg-action-btn" 
                            onClick={() => setReplyTo(msg)}
                            title="Reply to message"
                          >
                            <CornerUpLeft size={13} />
                          </button>
                          {currentUser.isAdmin && (
                            <button 
                              type="button" 
                              className="msg-action-btn delete" 
                              onClick={() => {
                                if (confirm("Delete this message?")) {
                                  deleteMessage(msg.id);
                                }
                              }}
                              title="Delete message"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>

                        {!isMe && <span className="message-sender-name">{msg.senderName}</span>}
                        
                        <div className="message-bubble">
                          {/* Reply Quote Display */}
                          {msg.replyTo && (
                            <div className="message-reply-quote">
                              <strong>@{msg.replyTo.senderName}</strong>: {msg.replyTo.text}
                            </div>
                          )}

                          {msg.text && <p style={{ margin: 0 }}>{msg.text}</p>}
                          {msg.image && (
                            <img 
                              src={msg.image} 
                              alt="Attachment" 
                              className="message-image-attachment" 
                              onClick={() => setLightboxImg(msg.image)}
                            />
                          )}
                          <span className="message-timestamp">{timeString}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Message box */}
            <div className="chat-input-area">
              {/* Message Reply Preview Bar */}
              {replyTo && (
                <div className="replying-to-banner">
                  <div className="replying-to-info">
                    <span className="replying-to-title">Replying to @{replyTo.senderName}</span>
                    <span className="replying-to-text">{replyTo.text || '📷 Attached Image'}</span>
                  </div>
                  <button type="button" className="remove-attachment-btn" onClick={() => setReplyTo(null)}>
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Attachment Preview Bar */}
              {attachedImage && (
                <div className="attachment-preview-bar">
                  <div className="attachment-preview-info">
                    <img src={attachedImage} alt="Preview" className="attachment-thumbnail" />
                    <span className="attachment-preview-name">{imageFileName || 'Image attached'}</span>
                  </div>
                  <button type="button" className="remove-attachment-btn" onClick={handleRemoveAttachment}>
                    <X size={16} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessageSubmit} className="chat-input-form">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
                
                {currentUser.isAdmin && activeRoom && (
                  <select 
                    value={impersonateUserId}
                    onChange={(e) => setImpersonateUserId(e.target.value)}
                    className="impersonate-select"
                    title="Send message as..."
                  >
                    <option value={currentUser.id}>Admin</option>
                    {activeRoom.members
                      .filter(id => id !== currentUser.id)
                      .map(id => {
                        const member = users.find(u => u.id === id);
                        return member ? (
                          <option key={member.id} value={member.id}>
                            {member.username}
                          </option>
                        ) : null;
                      })
                    }
                  </select>
                )}

                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach Image"
                >
                  <ImageIcon size={20} />
                </button>

                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={
                    replyTo 
                      ? `Reply to @${replyTo.senderName}...` 
                      : (attachedImage ? "Add a caption or send..." : "Type your message...")
                  }
                  className="chat-text-input"
                />

                <button 
                  type="submit" 
                  className="chat-send-btn"
                  disabled={!messageText.trim() && !attachedImage}
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="chat-empty-state">
            <MessageSquare className="chat-empty-icon" size={64} />
            <h3>No Chat Room Selected</h3>
            <p>
              Create a new chat room and set a password, or join an existing chat room from the sidebar list to start exchanging messages and images.
            </p>
          </div>
        )}
      </main>

      {/* Full screen Lightbox viewer for images */}
      {lightboxImg && (
        <div className="lightbox-overlay" onClick={() => setLightboxImg(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="lightbox-close-btn" onClick={() => setLightboxImg(null)}>
              <X size={20} />
            </button>
            <img src={lightboxImg} alt="Enlarged view" className="lightbox-image" />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
