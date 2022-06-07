#ifdef GL_ES
precision highp float;
#endif

#ifndef TERRAIN // This is provided by terrain prelude, but we also need it when terrain is not in use
// Pack depth to RGBA. A piece of code copied in various libraries and WebGL
// shadow mapping examples.
highp vec4 pack_depth(highp float ndc_z) {
    highp float depth = ndc_z * 0.5 + 0.5;
    const highp vec4 bit_shift = vec4(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0);
    const highp vec4 bit_mask  = vec4(0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0);
    highp vec4 res = fract(depth * bit_shift);
    res -= res.xxyz * bit_mask;
    return res;
}
#endif

varying highp float v_depth;

void main() {
    gl_FragColor = pack_depth(v_depth);
}