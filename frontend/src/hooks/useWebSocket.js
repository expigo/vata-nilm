import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(url) {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);
  
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const currentSubscription = useRef('ALL');

  const connect = useCallback(() => {
    try {
      console.log('🔌 Connecting to WebSocket:', url);
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        setError(null);
        
        ws.current.send(JSON.stringify({
          type: 'subscribe',
          siteType: currentSubscription.current
        }));
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'initial_state' || data.type === 'subscription_update') {
            console.log(`📦 Received ${data.count} initial messages`);
            setMessages(data.data || []);
          } else if (data.type === 'new_message') {
            setLastMessage(data);
            setMessages(prev => [data, ...prev].slice(0, 100));
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.current.onerror = (err) => {
        console.error('❌ WebSocket error:', err);
        setError('WebSocket connection error');
      };

      ws.current.onclose = () => {
        console.log('⚠️  WebSocket disconnected');
        setIsConnected(false);
        
        reconnectTimeout.current = setTimeout(() => {
          console.log('🔄 Reconnecting...');
          connect();
        }, 3000);
      };
    } catch (err) {
      console.error('❌ Failed to connect:', err);
      setError(err.message);
    }
  }, [url]);

  const subscribe = useCallback((siteType) => {
    currentSubscription.current = siteType;
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'subscribe',
        siteType
      }));
      console.log(`📡 Subscribed to: ${siteType}`);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    messages,
    lastMessage,
    error,
    subscribe
  };
}
