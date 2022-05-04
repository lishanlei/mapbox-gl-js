

uniform lowp vec3 u_lightpos;

varying vec4 v_pos_light_view_0;
varying vec4 v_pos_light_view_1;
varying vec4 v_color;
varying float v_depth;
varying vec3 v_normal;

void main() {
    vec4 color;

#ifdef RENDER_SHADOWS
    highp vec3 n = normalize(v_normal);
    vec3 lightdir = normalize(u_lightpos);
    float NDotL = clamp(dot(n, lightdir), 0.0, 1.0);

    float biasT = pow(NDotL, 1.0);
    float biasL0 = mix(0.02, 0.008, biasT);
    float biasL1 = mix(0.02, 0.008, biasT);
    float occlusionL0 = shadowOcclusionL0(v_pos_light_view_0, biasL0);
    float occlusionL1 = shadowOcclusionL1(v_pos_light_view_1, biasL1);
    float occlusion = 0.0; 

    // Alleviate projective aliasing by forcing backfacing triangles to be occluded
    float backfacing = 1.0 - smoothstep(0.0, 0.1, NDotL);

    if (v_depth < u_cascade_distances.x)
        occlusion = occlusionL0;
    else if (v_depth < u_cascade_distances.y)
        occlusion = occlusionL1;

    occlusion = mix(occlusion, 1.0, backfacing);
    color.xyz = v_color.xyz * mix(1.0, 1.0 - u_shadow_intensity, occlusion);
    color.a = v_color.a;
#else
    color = v_color;
#endif

#ifdef FOG
    color = fog_dither(fog_apply_premultiplied(color, v_fog_pos)).rgb;
#endif
    gl_FragColor = color;

#ifdef OVERDRAW_INSPECTOR
    gl_FragColor = vec4(1.0);
#endif
}
