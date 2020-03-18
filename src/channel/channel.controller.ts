import { Controller, Param, Post, HttpException } from '@nestjs/common';
import {
  ChannelService,
  GroupInput,
  GetMembersParams,
} from './channel.service';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { errorFilter } from '../common/error';
import { PreferenceService } from '../preference/preference.service';

@Controller()
export class ChannelController {
  constructor(
    private readonly service: ChannelService,
    private readonly preferenceService: PreferenceService,
  ) {}

  @GrpcMethod('ChannelService', 'Update')
  async update(params: any): Promise<any> {
    try {
      await this.service.updateGroup(params.id, params);
      return { status: 'success' };
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('ChannelService', 'Delete')
  async delete({ id }: any): Promise<any> {
    try {
      await this.service.removeGroup(id);
      return { status: 'success' };
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('ChannelService', 'Create')
  async create(params: GroupInput): Promise<any> {
    try {
      await this.service.createGroupCommon(params);
      return { status: 'success' };
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('ChannelService', 'List')
  async list(params: any): Promise<any> {
    try {
      const { keyword, pageNum, pageSize } = params;
      return await this.service.searchGroups(keyword, pageNum, pageSize);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('ChannelService', 'MemberList')
  async memberList(params: GetMembersParams): Promise<any> {
    try {
      return await this.service.getGroupMembers(params);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('ChannelService', 'DeleteMembers')
  async removeMembers(params: any): Promise<any> {
    try {
      const { channelId, userIds } = params;
      await this.service.removeGroupMembers(channelId, userIds);
      return { status: 'success' };
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('ChannelService', 'AddMembers')
  async addMembers(params: any): Promise<any> {
    try {
      const { channelId, userIds } = params;
      await this.service.addGroupMembers(channelId, userIds);
      return { status: 'success' };
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('ChannelService', 'GetFriendsList')
  async getFriendsList(params: any): Promise<any> {
    try {
      return await this.service.getUserFriendsList(params);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('ChannelService', 'GetBlacklist')
  async getBlacklist(params: any): Promise<any> {
    try {
      const result = await this.service.getUserBlacklist(params);
      return result;
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @Post('/web-portal/joinGroup/:code')
  async joinChannel(@Param() params): Promise<any> {
    try {
      const { code } = params;
      const {
        name,
        avatar,
        member_count,
      } = await this.service.getChannelDetail({
        code,
      });

      const [{ value }] = await this.preferenceService.find(['cdn_host']);
      const cdnAvatar = (avatar || '')
        .split(',')
        .map(p => p && `${value}/${p}`);
      return { name, avatar: cdnAvatar, member_count };
    } catch (error) {
      throw new HttpException(errorFilter(error), 404);
    }
  }
}
