import React, { useState, useEffect, useRef } from 'react';
import { Send, X, ShieldCheck, Paperclip } from 'lucide-react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import toast from 'react-hot-toast';

const API_BASE_URL = "https://Foodiee-backend-env.eba-5d9p6wzb.eu-north-1.elasticbeanstalk.com";

export default function OrderChatModal({ orderId, userMobile, userRole, recipientRole, orderStatus, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const stompClientRef = useRef(null);
  const messagesEndRef = useRef(null);

  const identifier = userMobile || localStorage.getItem('partnerMobile') || '9876543210';

 useEffect(() => {
    // Mobile number leda identifier ni clean cheyyadam (+91 leda spaces remove cheyyadam)
    const rawMob = identifier || orderId || '';
    const cleanId = String(rawMob).replace(/[\+\s]/g, '').replace(/^91/, '');

    if (!cleanId) return;

    // 1. Chat history fetch cheyyadam
    const historyEndpoint = recipientRole === 'admin' 
      ? `${API_BASE_URL}/api/admin-chat/history/${cleanId}`
      : `${API_BASE_URL}/api/chat/history/${cleanId}`;

    fetch(historyEndpoint)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch(err => console.error("Error fetching chat history", err));

    // 2. WebSocket live sync connection
    const socket = new SockJS(`${API_BASE_URL}/ws-foodiee`);
    const stompClient = new Client({
      webSocketFactory: () => socket,
      debug: () => {},
      onConnect: () => {
        // Clean chesina ID tho correct topic ki subscribe avvadam
        const subscribeTopic = recipientRole === 'admin'
          ? `/topic/chat/admin-partner/${cleanId}`
          : `/topic/chat/${cleanId}`;

        stompClient.subscribe(subscribeTopic, (messageOutput) => {
          const receivedMessage = JSON.parse(messageOutput.body);
          
          setMessages(prev => {
            const list = Array.isArray(prev) ? prev : [];
            const exists = list.some(m => 
              m.message === receivedMessage.message && 
              m.timestamp === receivedMessage.timestamp &&
              m.senderType === receivedMessage.senderType
            );
            if (exists) return list;
            return [...list, receivedMessage];
          });
        });
      }
    });

    stompClient.activate();
    stompClientRef.current = stompClient;

    return () => {
      if (stompClientRef.current) stompClientRef.current.deactivate();
    };
  }, [orderId, recipientRole, identifier]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedFile({ name: file.name, url: reader.result, type: file.type });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() && !selectedFile) return;

    let messageContent = inputMessage;
    if (selectedFile) {
      messageContent = `<div class="space-y-2"><p>${inputMessage}</p>${selectedFile.type.includes('image') ? `<img src="${selectedFile.url}" class="rounded-xl max-h-40 object-cover" />` : `<a href="${selectedFile.url}" download="${selectedFile.name}" class="text-xs underline text-amber-300">📎 ${selectedFile.name}</a>`}</div>`;
    }

    const timestamp = new Date().toISOString();

    if (recipientRole === 'admin') {
      const adminChatPayload = {
        partnerMobile: String(identifier),
        partnerName: localStorage.getItem('partnerName') || 'Partner / Merchant',
        senderType: userRole, 
        senderName: localStorage.getItem('partnerName') || 'User',
        message: messageContent,
        timestamp: timestamp
      };

      try {
        const res = await fetch(`${API_BASE_URL}/api/admin-chat/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adminChatPayload)
        });

        if (res.ok) {
          if (stompClientRef.current && stompClientRef.current.connected) {
            stompClientRef.current.publish({
              destination: `/app/admin-partner/send`,
              body: JSON.stringify(adminChatPayload)
            });
          }
          setInputMessage('');
          setSelectedFile(null);
        } else {
          toast.error("మెసేజ్ పంపడం విఫలమైంది");
        }
      } catch (err) {
        toast.error("టెక్నికల్ ఎర్రర్ ఏర్పడింది");
      }
    } else {
      const chatPayload = {
        orderId: orderId,
        senderMobile: identifier,
        senderName: userRole === 'customer' ? 'Customer' : userRole === 'partner' ? 'Delivery Partner' : 'Shop Owner',
        senderType: userRole,        
        recipientRole: recipientRole, 
        message: messageContent,
        timestamp: timestamp
      };

      try {
        const res = await fetch(`${API_BASE_URL}/api/chat/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chatPayload)
        });

        if (res.ok) {
          if (stompClientRef.current && stompClientRef.current.connected) {
            stompClientRef.current.publish({
              destination: `/app/send/${identifier}`,
              body: JSON.stringify(chatPayload)
            });
          }
          setInputMessage('');
          setSelectedFile(null);
        } else {
          toast.error("మెసేజ్ పంపడం విఫలమైంది");
        }
      } catch (err) {
        toast.error("టెక్నికల్ ఎర్రర్ ఏర్పడింది");
      }
    }
  };

  // ✅ WhatsApp Style Date Grouping Logic
  const renderGroupedChatMessages = (messagesList) => {
    const todayStr = new Date().toLocaleDateString();
    
    const grouped = messagesList.reduce((acc, msg) => {
      const msgDate = msg.timestamp ? new Date(msg.timestamp).toLocaleDateString() : todayStr;
      const dateKey = msgDate === todayStr ? 'Today' : msgDate;
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(msg);
      return acc;
    }, {});

    return Object.entries(grouped).map(([dateLabel, msgs], idx) => (
      <div key={idx} className="space-y-3">
        <div className="flex justify-center my-3">
          <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-3 py-1 rounded-full shadow-inner border border-slate-700 uppercase tracking-wider">
            {dateLabel}
          </span>
        </div>

        {msgs.map((msg, mIdx) => {
          const isMe = msg.senderType === userRole;
          return (
            <div key={mIdx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-0.5`}>
              <div className={`max-w-[80%] p-3.5 rounded-2xl text-xs shadow-md relative ${
                isMe 
                  ? 'bg-[#005c4b] text-white rounded-br-none font-bold' // WhatsApp Outgoing Dark Teal
                  : 'bg-[#202c33] text-white rounded-bl-none border border-slate-700/50' // WhatsApp Incoming Dark Gray
              }`}>
                <span className={`block text-[9px] uppercase font-black mb-1 ${isMe ? 'text-emerald-300' : 'text-[#fc8019]'}`}>
                  {msg.senderName || msg.senderType}
                </span>
                <div className="text-xs font-medium leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.message }} />
                <span className="block text-[8px] text-slate-400 text-right mt-1">
                  {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    ));
  };

  return (
    <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0b141a] border-2 border-[#00a884] w-full max-w-md h-[580px] rounded-[32px] flex flex-col shadow-2xl text-white relative font-sans overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-[#202c33] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center font-black shadow">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="text-xs font-black text-white">Foodiee WhatsApp Support</h3>
              <p className="text-[10px] text-emerald-400 font-bold">● Online ({userRole})</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer p-1">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Messages Window */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[radial-gradient(#111b21_1px,transparent_1px)] [background-size:16px_16px]">
          {orderStatus === 'DELIVERED' || orderStatus === 'COMPLETED' ? (
            <div className="text-center py-20 text-slate-400 text-xs font-bold">
              🔒 ఆర్డర్ డెలివరీ అయింది. చాట్ సెషన్ ముగిసింది.
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20 text-slate-500 space-y-1">
              <p className="text-xs font-bold">ఇక్కడ ఎలాంటి మెసేజ్‌లు లేవు.</p>
              <p className="text-[10px]">మాట్లాడటం ప్రారంభించడానికి కింద టైప్ చేయండి.</p>
            </div>
          ) : (
            renderGroupedChatMessages(messages)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Selected File Preview */}
        {selectedFile && (
          <div className="px-4 py-2 bg-[#202c33] border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-amber-400 truncate max-w-[250px]">📎 {selectedFile.name}</span>
            <button onClick={() => setSelectedFile(null)} className="text-rose-400 font-bold cursor-pointer">తొలగించు</button>
          </div>
        )}

        {/* Input Box */}
        {orderStatus !== 'DELIVERED' && orderStatus !== 'COMPLETED' && (
          <form onSubmit={handleSendMessage} className="p-3 bg-[#202c33] border-t border-slate-800 flex items-center gap-2">
            <label className="text-slate-400 hover:text-white cursor-pointer p-2.5 rounded-xl bg-[#2a3942] border border-slate-700/50">
              <Paperclip size={16} />
              <input type="file" onChange={handleFileUpload} className="hidden" accept="image/*,.pdf,.doc,.docx" />
            </label>
            
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="మెసేజ్ టైప్ చేయండి..."
              className="flex-1 bg-[#2a3942] border border-slate-700/50 px-4 py-3 rounded-xl text-xs font-bold text-white outline-none focus:border-[#00a884] transition"
            />

            <button 
              type="submit" 
              className="bg-[#00a884] hover:bg-[#008f72] text-white px-4 py-3 rounded-xl font-black text-xs shadow cursor-pointer flex items-center gap-1 transition"
            >
              <Send size={14} /> పంపు
            </button>
          </form>
        )}

      </div>
    </div>
  );
}