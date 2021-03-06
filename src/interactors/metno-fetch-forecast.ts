const debug = require("debug")("weather-domain");
var xml2js = require("xml2js");

import fetch from "node-fetch";
import { FetchForecast, FetchForecastResult } from "./fetch-forecast";
import { TimezoneGeoPoint } from "../entities";
import { GeoPoint, ForecastUnits } from "../entities/common";
import { MetnoDataMapper } from "../mappers/metno-data-mapper";
import { ReportHelper } from "../entities/report-helper";
import { HourlyDataBlock } from "../entities/data-block";

export class MetnoFetchForecast extends FetchForecast {
  constructor(private userAgent: string) {
    super();
  }
  protected innerExecute(
    params: TimezoneGeoPoint
  ): Promise<FetchForecastResult | null> {
    return getMetnoData(params, this.userAgent)
      .then((data) => formatData(data))
      .then((data) => {
        if (!data) {
          debug("MetnoFetcher no data");
          return null;
        }
        const allHourly = MetnoDataMapper.toHourlyDataBlock(data, params);
        const details = ReportHelper.hoursDataBlock(allHourly.data);
        const hourly: HourlyDataBlock = {
          icon: allHourly.icon,
          data: allHourly.data.slice(0, 24)
        };

        return { details, hourly, units: ForecastUnits.SI };
      });
  }
}

function formatData(data: any): any[] | null {
  if (!data || !data.weatherdata) {
    return null;
  }
  data = data.weatherdata;

  const result: any[] = [];
  const times: any[] = data.product.time;

  const startTime = new Date(times[0].from);
  const endTime = startTime.getTime() + 11 * 1000 * 86400;
  let item;
  let time;

  for (let i = 0; i < times.length; i++) {
    time = times[i];
    // is details
    if (!time.location.symbol) {
      time.fromDate = new Date(time.from);
      if (time.fromDate.getTime() > endTime) {
        debug(`END metno parse report ${item.fromDate}`);
        break;
      }
      // if (options.hours.indexOf(time.fromDate.getUTCHours()) > -1) {
      item = time.location;
      item.time = Math.trunc(time.fromDate.getTime() / 1000);
      i++;
      if (i < times.length && times[i].location.symbol) {
        item.symbol = times[i].location.symbol;
        item.precipitation = times[i].location.precipitation;
        item.maxTemperature = times[i].location.maxTemperature;
        item.minTemperature = times[i].location.minTemperature;
      }
      item = formatTimeItem(item);
      result.push(item);
      // }
    }
  }

  return result;
}

function formatTimeItem(item: any) {
  delete item.altitude;
  delete item.latitude;
  delete item.longitude;
  // delete item.lowClouds;
  // delete item.mediumClouds;
  // delete item.highClouds;
  // delete item.dewpointTemperature;

  for (var prop in item) {
    if (prop !== "time" && item[prop]) {
      delete item[prop].id;

      for (var p in item[prop]) {
        if (
          ~["percent", "value", "mps", "number", "beaufort", "deg"].indexOf(p)
        ) {
          item[prop][p] = parseFloat(item[prop][p]);
        }
      }
    }
  }
  return item;
}

function getMetnoData(geoPint: GeoPoint, userAgent: string): Promise<any> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/classic?lat=${geoPint.latitude};lon=${geoPint.longitude}`;
  const options = {
    timeout: 5000,
    method: "GET",
    gzip: true,
    headers: {
      "user-agent": userAgent
    }
  };

  return fetch(url, options)
    .then((response) => response.text())
    .then(
      (body) =>
        new Promise<any>((resolve, reject) => {
          new xml2js.Parser({
            async: true,
            mergeAttrs: true,
            explicitArray: false
          }).parseString(body, function (parseError: any, json: any) {
            if (parseError) {
              return reject(parseError);
            }
            resolve(json);
          });
        })
    );
}
