import { Socket } from 'socket.io';

export interface ExtendedSocket extends Socket {
  user?: {
    id: number;
    uid: string;
    state: string;
    avatar: string | null;
    nickname: string;
  };
  clientInfo?: { id: number; platform: string }; // 客户端连接实体信息
}

export interface EventResult {
  status: 'success' | 'failed';
  [ormName: string]: any;
}
