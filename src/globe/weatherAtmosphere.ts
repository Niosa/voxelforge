import {
  Color,
  JulianDate,
} from 'cesium';
import { getViewer } from '@/globe/CesiumViewer';
import type { WeatherType } from '@/state/uiStore';

class WeatherAtmosphereController {
  private activeWeather: WeatherType = 'clear';

  /** Update time of day (hours 0.0 to 24.0) */
  public setTimeOfDay(hours: number): void {
    const viewer = getViewer();
    if (!viewer) return;

    // Convert hours to JulianDate time of day offset
    const date = new Date();
    date.setUTCHours(Math.floor(hours), Math.floor((hours % 1) * 60), 0, 0);

    const julianDate = JulianDate.fromDate(date);
    viewer.clock.currentTime = julianDate;

    // Adjust sky & atmosphere tinting based on time of day
    const scene = viewer.scene;
    const isNight = hours < 6 || hours > 19;
    const isDawnDusk = (hours >= 5 && hours <= 7) || (hours >= 18 && hours <= 20);

    if (isNight) {
      scene.globe.baseColor = Color.fromCssColorString('#020617'); // Dark starry slate
      if (scene.skyAtmosphere) {
        scene.skyAtmosphere.brightnessShift = -0.75;
        scene.skyAtmosphere.hueShift = 0.55; // Deep indigo
      }
    } else if (isDawnDusk) {
      scene.globe.baseColor = Color.fromCssColorString('#451a03'); // Warm amber gold
      if (scene.skyAtmosphere) {
        scene.skyAtmosphere.brightnessShift = 0.1;
        scene.skyAtmosphere.hueShift = -0.15; // Golden sunset hue
      }
    } else {
      scene.globe.baseColor = Color.fromCssColorString('#2d5a27'); // Lush green daylight
      if (scene.skyAtmosphere) {
        scene.skyAtmosphere.brightnessShift = 0.0;
        scene.skyAtmosphere.hueShift = 0.0;
      }
    }

    scene.requestRender();
  }

  /** Set active weather preset */
  public setWeather(weather: WeatherType): void {
    this.activeWeather = weather;
    const viewer = getViewer();
    if (!viewer) return;

    const scene = viewer.scene;

    if (weather === 'fog' || weather === 'storm') {
      if (scene.fog) {
        scene.fog.enabled = true;
        scene.fog.density = 0.0008;
        scene.fog.screenSpaceErrorFactor = 4.0;
      }
    } else if (weather === 'rain') {
      if (scene.fog) {
        scene.fog.enabled = true;
        scene.fog.density = 0.0003;
      }
    } else {
      if (scene.fog) {
        scene.fog.enabled = true;
        scene.fog.density = 0.0001; // Crisp clear view
      }
    }

    scene.requestRender();
  }

  public getWeather(): WeatherType {
    return this.activeWeather;
  }
}

export const weatherAtmosphere = new WeatherAtmosphereController();
