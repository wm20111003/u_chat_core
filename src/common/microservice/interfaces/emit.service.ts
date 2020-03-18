export interface EmitToRoomArgs {
  room: string;
  event: string;
  data: any;
}

export interface EmitToSocketsArgs {
  socketIds: string[];
  event: string;
  data: any;
}

export interface JoinRoomArgs {
  room: string;
  socketIds: string[];
}

export interface LeaveRoomArgs {
  room: string;
  socketIds: string[];
}

export interface Result {
  status: string;
  code?: string;
}

export interface EmitService {
  emitToRoom(args: EmitToRoomArgs): Promise<Result> | never;
  emitToSockets(args: EmitToSocketsArgs): Promise<Result> | never;
  joinRoom(args: JoinRoomArgs): Promise<Result> | never;
  leaveRoom(args: LeaveRoomArgs): Promise<Result> | never;
}
