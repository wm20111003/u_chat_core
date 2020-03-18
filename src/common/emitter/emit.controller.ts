import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import {
  EmitService,
  EmitToRoomArgs,
  EmitToSocketsArgs,
  JoinRoomArgs,
  LeaveRoomArgs,
} from './emit.service';

@Controller('emit')
export class EmitController {
  constructor(private readonly service: EmitService) {}

  @GrpcMethod('EmitService', 'EmitToRoom')
  async emitToRoom(args: EmitToRoomArgs): Promise<any> {
    try {
      return await this.service.emitToRoom(args);
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @GrpcMethod('EmitService', 'EmitToSockets')
  async emitToSockets(args: EmitToSocketsArgs): Promise<any> {
    try {
      return await this.service.emitToSockets(args);
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @GrpcMethod('EmitService', 'JoinRoom')
  async joinRoom(args: JoinRoomArgs): Promise<any> {
    try {
      return await this.service.joinRoom(args);
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @GrpcMethod('EmitService', 'LeaveRoom')
  async leaveRoom(args: LeaveRoomArgs): Promise<any> {
    try {
      return await this.service.leaveRoom(args);
    } catch (error) {
      throw new RpcException(error.message);
    }
  }
}
