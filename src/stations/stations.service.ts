import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { StationQuery } from '../query/station-query';
import { searchStations } from './station-filter';
import { StationStore } from './station-store';
import {
  AggregatedStationResponse,
  PegelonlineStation,
  PegelonlineTimeseries,
} from './station.model';

@Injectable()
export class StationsService {
  private readonly pegelonlineBaseUrl = this.configService.get<string>(
    'PEGELONLINE_BASE_URL',
  );
  private readonly mqttBase = this.configService.get<string>(
    'MQTT_BASE',
    'edis/pegelonline',
  );

  constructor(
    private readonly stationStore: StationStore,
    private readonly configService: ConfigService,
  ) {}

  getStations(query: StationQuery = {}): PegelonlineStation[] {
    return searchStations(this.stationStore.getAll(), query);
  }

  prepareResponse(stations: PegelonlineStation[]): AggregatedStationResponse {
    // TODO: add here some intelligent aggregation of mqtt topics
    const mqtttopics = [];
    const pegelonlinelinks = [];
    const preparedStations = stations.map((st) => {
      const stationTopic = `${this.mqttBase}/+/+/+/+/${st.uuid}/+`;
      mqtttopics.push(stationTopic);
      const timeseries = st.timeseries.map((ts) => {
        const mqtttopic = `${this.mqttBase}/+/+/+/+/${st.uuid}/${ts.shortname}`;
        const pegelonlinelink = `${this.pegelonlineBaseUrl}/stations/${st.uuid}/${ts.shortname}/measurements.json`;
        pegelonlinelinks.push(pegelonlinelink);
        return { ...ts, mqtttopic, pegelonlinelink } as PegelonlineTimeseries;
      });
      const station = {
        ...st,
        timeseries,
        mqtttopic: stationTopic,
      } as PegelonlineStation;
      return station;
    });
    return {
      mqtttopics,
      pegelonlinelinks,
      stations: preparedStations,
    };
  }
}
