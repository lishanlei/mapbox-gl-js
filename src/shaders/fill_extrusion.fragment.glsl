
uniform lowp vec3 u_lightpos;

varying vec4 v_color;

#ifdef RENDER_SHADOWS
varying vec4 v_pos_light_view_0;
varying vec4 v_pos_light_view_1;
varying float v_depth;
varying vec3 v_normal;
#endif

void main() {
    vec4 color = v_color;

#ifdef RENDER_SHADOWS
    color.xyz = shadowed_color_normal(color.xyz, normalize(v_normal), normalize(u_lightpos),
        v_pos_light_view_0, v_pos_light_view_1, v_depth);
#endif

#ifdef FOG
    color = fog_dither(fog_apply_premultiplied(color, v_fog_pos));
#endif
    gl_FragColor = color;

#ifdef OVERDRAW_INSPECTOR
    gl_FragColor = vec4(1.0);
#endif
}
