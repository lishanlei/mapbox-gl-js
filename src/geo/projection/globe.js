// @flow
import {mat4, vec3} from 'gl-matrix';
import EXTENT from '../../data/extent.js';
import LngLat from '../lng_lat.js';
import {degToRad} from '../../util/util.js';
import MercatorCoordinate, {
    lngFromMercatorX,
    latFromMercatorY,
    mercatorZfromAltitude,
} from '../mercator_coordinate.js';
import Mercator from './mercator.js';
import Point from '@mapbox/point-geometry';
import {farthestPixelDistanceOnPlane, farthestPixelDistanceOnSphere} from './far_z.js';
import {number as interpolate} from '../../style-spec/util/interpolate.js';
import {
    GLOBE_RADIUS,
    latLngToECEF,
    globeTileBounds,
    globeNormalizeECEF,
    globeDenormalizeECEF,
    globeECEFNormalizationScale,
    globeToMercatorTransition,
    globePointCoordinate
} from './globe_util.js';

import type Transform from '../transform.js';
import type {ElevationScale} from './projection.js';
import type {Vec3} from 'gl-matrix';
import type {ProjectionSpecification} from '../../style-spec/types.js';
import type {CanonicalTileID, UnwrappedTileID} from '../../source/tile_id.js';

export const GLOBE_METERS_TO_ECEF = mercatorZfromAltitude(1, 0.0) * 2.0 * GLOBE_RADIUS * Math.PI;

export default class Globe extends Mercator {

    constructor(options: ProjectionSpecification) {
        super(options);
        this.requiresDraping = true;
        this.supportsWorldCopies = false;
        this.supportsFog = true;
        this.zAxisUnit = "pixels";
        this.unsupportedLayers = ['debug', 'custom'];
        this.range = [3, 5];
    }

    projectTilePoint(x: number, y: number, id: CanonicalTileID): {x: number, y: number, z: number} {
        const tiles = Math.pow(2.0, id.z);
        const mx = (x / EXTENT + id.x) / tiles;
        const my = (y / EXTENT + id.y) / tiles;
        const lat = latFromMercatorY(my);
        const lng = lngFromMercatorX(mx);
        const pos = latLngToECEF(lat, lng);

        const bounds = globeTileBounds(id);
        const normalizationMatrix = globeNormalizeECEF(bounds);
        vec3.transformMat4(pos, pos, normalizationMatrix);

        return {x: pos[0], y: pos[1], z: pos[2]};
    }

    locationPoint(tr: Transform, lngLat: LngLat): Point {
        const pos = latLngToECEF(lngLat.lat, lngLat.lng);
        const up = vec3.normalize([], pos);

        const elevation = tr.elevation ?
            tr.elevation.getAtPointOrZero(tr.locationCoordinate(lngLat), tr._centerAltitude) :
            tr._centerAltitude;

        const upScale = mercatorZfromAltitude(1, 0) * EXTENT * elevation;
        vec3.scaleAndAdd(pos, pos, up, upScale);
        const matrix = mat4.identity(new Float64Array(16));
        mat4.multiply(matrix, tr.pixelMatrix, tr.globeMatrix);
        vec3.transformMat4(pos, pos, matrix);

        return new Point(pos[0], pos[1]);
    }

    pixelsPerMeter(lat: number, worldSize: number): number {
        return mercatorZfromAltitude(1, 0) * worldSize;
    }

    createTileMatrix(tr: Transform, worldSize: number, id: UnwrappedTileID): Float64Array {
        const decode = globeDenormalizeECEF(globeTileBounds(id.canonical));
        return mat4.multiply(new Float64Array(16), tr.globeMatrix, decode);
    }

    createInversionMatrix(tr: Transform, id: CanonicalTileID): Float32Array {
        const {center} = tr;
        const matrix = mat4.identity(new Float64Array(16));
        const encode = globeNormalizeECEF(globeTileBounds(id));
        mat4.multiply(matrix, matrix, encode);
        mat4.rotateY(matrix, matrix, degToRad(center.lng));
        mat4.rotateX(matrix, matrix, degToRad(center.lat));
        mat4.scale(matrix, matrix, [tr._projectionScaler, tr._projectionScaler, 1.0]);
        return Float32Array.from(matrix);
    }

    pointCoordinate(tr: Transform, x: number, y: number, _: number): MercatorCoordinate {
        const coord = globePointCoordinate(tr, x, y, true);
        if (!coord) { return new MercatorCoordinate(0, 0); } // This won't happen, is here for Flow
        return coord;
    }

    pointCoordinate3D(tr: Transform, x: number, y: number): ?Vec3 {
        const coord = this.pointCoordinate(tr, x, y, 0);
        return [coord.x, coord.y, coord.z];
    }

    isPointAboveHorizon(tr: Transform, p: Point): boolean {
        const raycastOnGlobe = globePointCoordinate(tr, p.x, p.y, false);
        return !raycastOnGlobe;
    }

    farthestPixelDistance(tr: Transform): number {
        const pixelsPerMeter = this.pixelsPerMeter(tr.center.lat, tr.worldSize);
        const globePixelDistance = farthestPixelDistanceOnSphere(tr, pixelsPerMeter);
        const t = globeToMercatorTransition(tr.zoom);
        if (t > 0.0) {
            const mercatorPixelsPerMeter = mercatorZfromAltitude(1, tr.center.lat) * tr.worldSize;
            const mercatorPixelDistance = farthestPixelDistanceOnPlane(tr, mercatorPixelsPerMeter);
            const pixelRadius = tr.worldSize / (2.0 * Math.PI);
            const approxTileArcHalfAngle = Math.max(tr.width, tr.height) / tr.worldSize * Math.PI;
            const padding = pixelRadius * (1.0 - Math.cos(approxTileArcHalfAngle));

            // During transition to mercator we would like to keep
            // the far plane lower to ensure that geometries (e.g. circles) that are far away and are not supposed
            // to be rendered get culled out correctly. see https://github.com/mapbox/mapbox-gl-js/issues/11476
            // To achieve this we dampen the interpolation.
            return interpolate(globePixelDistance, mercatorPixelDistance + padding, Math.pow(t, 10.0));
        }
        return globePixelDistance;
    }

    upVector(id: CanonicalTileID, x: number, y: number): Vec3 {
        const tiles = 1 << id.z;
        const mercX = (x / EXTENT + id.x) / tiles;
        const mercY = (y / EXTENT + id.y) / tiles;
        return latLngToECEF(latFromMercatorY(mercY), lngFromMercatorX(mercX), 1.0);
    }

    upVectorScale(id: CanonicalTileID): ElevationScale {
        return {metersToTile: GLOBE_METERS_TO_ECEF * globeECEFNormalizationScale(globeTileBounds(id))};
    }
}
