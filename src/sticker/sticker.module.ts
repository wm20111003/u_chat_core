import { Module } from '@nestjs/common';
import { Sticker } from './sticker.entity';
import { StickerService } from './sticker.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StickerGroup } from './sticker_group.entity';
import { StickerGroupsUser } from './sticker_groups_user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sticker, StickerGroup, StickerGroupsUser]),
  ],
  providers: [StickerService],
  exports: [StickerService],
})
export class StickerModule {}
