import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Preference } from './preference.entity';
import { PreferenceService } from './preference.service';
import { PreferenceController } from './preference.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Preference])],
  providers: [PreferenceService],
  exports: [PreferenceService],
  controllers: [PreferenceController],
})
export class PreferenceModule {}
