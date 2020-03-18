import * as EventEmitter from 'events';
import { WebSocketServer } from '@nestjs/websockets';
import { Server, Adapter } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { chunk } from 'lodash';
import { captureException } from '../../common/utils';

export interface ExtendedAdapter extends Adapter {
  remoteJoin?(socketId: string, room: string, callback?: any): void;
  remoteLeave?(socketId: string, room: string, callback?: any): void;
  remoteDisconnect?(socketId: string, room: string, callback?: any): void;
  clients?(roomsOrCallback?: any, callback?: any): any;
  clientRooms?(socketId: string, callback?: any): any;
}

export interface EmitToRoomArgs {
  room: string | number;
  event: string;
  data: any;
}
export interface EmitToSocketsArgs {
  socketIds: string[];
  event: string;
  data: any;
}
export interface JoinRoomArgs {
  room: string | number;
  socketIds: string[];
}
export interface LeaveRoomArgs {
  room: string | number;
  socketIds: string[];
}

export interface Result {
  status: string;
  code?: string;
}

@Injectable()
export class EmitService extends EventEmitter {
  @WebSocketServer()
  server: Server;
  adapter: ExtendedAdapter;

  constructor() {
    super();
    this.on('socket-server-ready', server => {
      this.server = server;
      this.adapter = this.server.of('/').adapter;
    });
  }

  async clients(rooms?: string[]): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const callback = (error, clients) => {
        if (error) return reject(error);
        resolve(clients);
      };
      if (rooms && rooms.length > 0) {
        this.adapter.clients(rooms, callback);
      } else {
        this.adapter.clients(callback);
      }
    });
  }

  async emitToRoom({
    room,
    event,
    data,
  }: EmitToRoomArgs): Promise<Result> | never {
    try {
      if (!room) {
        return;
      }
      this.server.to(String(room)).emit(event, data);
      return { status: 'success' };
    } catch (error) {
      throw error;
    }
  }

  async emitToSockets({
    event,
    socketIds,
    data,
  }: EmitToSocketsArgs): Promise<Result> | never {
    try {
      if (socketIds.length === 0) {
        return { status: 'success' };
      }
      for (const sid of socketIds) {
        if (!sid) continue;
        this.server.to(sid).emit(event, data);
      }
      return { status: 'success' };
    } catch (error) {
      throw error;
    }
  }

  async joinRoom({ room, socketIds }: JoinRoomArgs): Promise<Result> | never {
    try {
      if (!room) {
        return;
      }
      if (socketIds.length === 0) {
        return { status: 'success' };
      }
      for (const sid of socketIds) {
        if (!sid) continue;
        this.adapter.remoteJoin(sid, String(room));
      }
      return { status: 'success' };
    } catch (error) {
      throw error;
    }
  }

  async leaveRoom({ room, socketIds }: LeaveRoomArgs): Promise<Result> | never {
    try {
      if (!room) {
        return;
      }
      if (socketIds.length === 0) {
        return { status: 'success' };
      }
      for (const sid of socketIds) {
        if (!sid) continue;
        this.adapter.remoteLeave(sid, String(room));
      }
      return { status: 'success' };
    } catch (error) {
      throw error;
    }
  }

  async leaveAllRooms({ socketId }): Promise<Result> | never {
    try {
      if (!socketId) {
        return;
      }
      return await new Promise(resolve => {
        this.adapter.clientRooms(socketId, (error, rooms) => {
          if (error) {
            captureException(error);
          } else {
            for (const room of rooms) {
              if (room === socketId) continue;
              this.adapter.remoteLeave(socketId, String(room));
            }
          }
          resolve({ status: 'success' });
        });
      });
    } catch (error) {
      throw error;
    }
  }
}
