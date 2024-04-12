import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { AppService } from './app.service';

import { CurrentLimits, StaticInfo, BackhomeConsultResult } from 'zaychik-server-proto';
import { cluster } from "../to-agent/app";
import { FanCurve } from 'zaychik-server-proto';

@Controller("/api")
export class AppController {
  constructor(private readonly appService: AppService) {
  }

  @Get("/current-limits")
  getCurrentLimits(): CurrentLimits {
    return cluster.get_current_limits();
  }

  @Get("/static-info")
  getStaticInfo(): StaticInfo {
    return cluster.get_static_info();
  }

  @Put("/cpu")
  async setCpuClocks(
    @Body() payload: {clocks: number[][], is_confirmed_to_warning: boolean}
  ): Promise<BackhomeConsultResult> {
    try {
      const result = await cluster.set_cpu_clocks(payload.clocks, payload.is_confirmed_to_warning);
      return result;
    } catch (e: any) {
      console.error(e);
      throw new BadRequestException(e.message);
    }
  }

  @Put("/gpu")
  async setGpuClocks(
    @Body() payload: {clocks: (number | null)[], is_confirmed_to_warning: boolean}
  ): Promise<BackhomeConsultResult> {
    try {
      const result = await cluster.set_gpu_clocks(payload.clocks, payload.is_confirmed_to_warning);
      return result;
    } catch (e: any) {
      console.error(e);
      throw new BadRequestException(e.message);
    }
  }

  @Put("/fan")
  async setFanSpeeds(
    @Body() payload: {curves: FanCurve[][], is_confirmed_to_warning: boolean}
  ): Promise<BackhomeConsultResult> {
    try {
      const result = await cluster.set_fan_speeds(payload.curves, payload.is_confirmed_to_warning);
      return result;
    } catch (e: any) {
      console.error(e);
      throw new BadRequestException(e.message);
    }
  }
}
