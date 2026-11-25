/* DISCI – dữ liệu tham chiếu & dữ liệu DEMO. Mọi giá, calo, số liệu cộng đồng đều là THAM KHẢO / DEMO. */
(function (root) {
  'use strict';
  var CATS = { nguc: 'Ngực', lung: 'Lưng', vai: 'Vai', tay: 'Tay', bung: 'Bụng', chan: 'Chân', cardio: 'Cardio', toanthan: 'Toàn thân', gian: 'Giãn cơ & phục hồi' };
  var CAT_ICON = { nguc: 'fitness_center', lung: 'accessibility_new', vai: 'sports_gymnastics', tay: 'sports_martial_arts', bung: 'self_improvement', chan: 'directions_walk', cardio: 'directions_run', toanthan: 'bolt', gian: 'spa' };
  var EQUIP = { none: 'Không dụng cụ', mat: 'Thảm tập', band: 'Dây kháng lực', dumbbell: 'Tạ tay', pullup: 'Xà đơn', rope: 'Dây nhảy', treadmill: 'Máy chạy bộ' };
  var LEVELS = { 1: 'Dễ', 2: 'Trung bình', 3: 'Khó' };

  /* E(id, tên, nhóm, cơ tác động, mức, dụng cụ, kiểu, hiệp, lần|giây, nghỉ, tags, êm(quiet), các bước, lỗi thường gặp, thay thế, cảnh báo, MET) */
  var X = [];
  function E(id, name, cat, muscles, lvl, equip, kind, sets, amt, rest, tags, quiet, steps, mistakes, rep, warn, met) {
    X.push({ id: id, name: name, cat: cat, muscles: muscles, level: lvl, equip: equip, kind: kind, sets: sets, amt: amt, rest: rest,
      tags: tags, quiet: quiet, steps: steps, mistakes: mistakes, rep: rep || null, warn: warn || '', met: met || 4 });
  }
  /* tags: knee=tải khớp gối · impact=va đập mạnh · spine=tải cột sống · overhead=đưa tay quá đầu · shoulder=tải vai · wrist=tải cổ tay · intense=cường độ tim mạch cao */
  E('pushup', 'Hít đất', 'nguc', 'Ngực, vai trước, tay sau', 2, ['none'], 'reps', 3, 10, 60, ['shoulder', 'wrist'], true,
    ['Chống tay rộng hơn vai, thân thẳng từ đầu đến gót.', 'Hạ ngực gần sát sàn, khuỷu tay chếch 45°.', 'Đẩy lên, thở ra.'], ['Võng lưng', 'Khuỷu tay mở 90° sang hai bên'], 'knee_pushup', '', 4);
  E('knee_pushup', 'Hít đất quỳ gối', 'nguc', 'Ngực, tay sau', 1, ['mat'], 'reps', 3, 10, 60, ['wrist'], true,
    ['Quỳ trên thảm, tay chống rộng bằng vai.', 'Giữ thân thẳng từ đầu đến gối, hạ ngực xuống.', 'Đẩy lên đều tay.'], ['Chổng mông', 'Hạ không hết biên độ'], 'incline_pushup', '', 3.5);
  E('incline_pushup', 'Hít đất nghiêng (tay chống ghế/bàn vững)', 'nguc', 'Ngực, vai trước', 1, ['none'], 'reps', 3, 10, 60, [], true,
    ['Chống tay lên mặt ghế/bàn chắc chắn, chân lùi ra sau.', 'Hạ ngực xuống mép ghế rồi đẩy lên.'], ['Dùng ghế trơn trượt', 'Cúi đầu'], null, '', 3.5);
  E('band_chest_press', 'Đẩy ngực với dây kháng lực', 'nguc', 'Ngực, tay sau', 1, ['band'], 'reps', 3, 12, 60, [], true,
    ['Quàng dây sau lưng, hai tay cầm hai đầu.', 'Đẩy thẳng ra trước đến khi duỗi tay.', 'Thả chậm về vị trí ban đầu.'], ['Nhún vai', 'Thả dây quá nhanh'], null, '', 3.5);
  E('db_floor_press', 'Đẩy tạ nằm sàn', 'nguc', 'Ngực, tay sau', 2, ['dumbbell', 'mat'], 'reps', 3, 10, 75, [], true,
    ['Nằm ngửa, gối co, tạ ở hai bên ngực.', 'Đẩy tạ lên thẳng tay, hạ chậm đến khi khuỷu chạm sàn.'], ['Khuỷu mở quá rộng', 'Ưỡn lưng'], 'band_chest_press', '', 4);
  E('diamond_pushup', 'Hít đất kim cương', 'nguc', 'Ngực trong, tay sau', 3, ['none'], 'reps', 3, 8, 75, ['wrist', 'shoulder'], true,
    ['Hai bàn tay chụm tạo hình thoi dưới ngực.', 'Hạ người, khuỷu sát thân, đẩy lên.'], ['Đau cổ tay vẫn cố tập'], 'pushup', 'Yêu cầu sức mạnh tay và cổ tay tốt.', 4.5);

  E('band_row', 'Kéo dây kháng lực ngồi', 'lung', 'Lưng giữa, cơ xô, tay trước', 1, ['band'], 'reps', 3, 12, 60, [], true,
    ['Ngồi duỗi chân, móc dây quanh bàn chân.', 'Kéo hai khuỷu ra sau, ép bả vai.', 'Thả chậm.'], ['Gù lưng', 'Nhún vai khi kéo'], null, '', 3.5);
  E('db_row', 'Kéo tạ một tay', 'lung', 'Cơ xô, lưng giữa', 1, ['dumbbell'], 'reps', 3, 10, 60, ['spine'], true,
    ['Một tay chống ghế, lưng phẳng, tay kia cầm tạ.', 'Kéo khuỷu lên sát hông, siết bả vai.'], ['Xoay người', 'Dùng đà'], 'band_row', '', 4);
  E('superman', 'Superman', 'lung', 'Cơ dựng sống, mông', 1, ['mat'], 'reps', 3, 12, 45, ['spine'], true,
    ['Nằm sấp, hai tay duỗi trước.', 'Nhấc tay chân lên vài giây rồi hạ xuống.'], ['Ngửa cổ quá mức'], 'bird_dog', 'Dừng nếu đau thắt lưng.', 3);
  E('pullup', 'Hít xà đơn', 'lung', 'Cơ xô, tay trước', 3, ['pullup'], 'reps', 3, 6, 90, ['shoulder', 'overhead'], true,
    ['Nắm xà rộng hơn vai, treo người.', 'Kéo cằm qua xà, hạ chậm.'], ['Đung đưa lấy đà', 'Không duỗi hết tay'], 'band_row', 'Cần sức mạnh nền tảng; đảm bảo xà gắn chắc chắn.', 5);
  E('reverse_snow_angel', 'Snow angel ngược', 'lung', 'Lưng trên, vai sau', 1, ['mat'], 'reps', 3, 12, 45, [], true,
    ['Nằm sấp, tay dọc thân.', 'Vẽ vòng cung tay lên quá đầu rồi trở về.'], ['Nâng ngực quá cao'], null, '', 3);

  E('db_shoulder_press', 'Đẩy tạ qua đầu', 'vai', 'Vai, tay sau', 2, ['dumbbell'], 'reps', 3, 10, 75, ['overhead', 'shoulder'], true,
    ['Đứng/ngồi thẳng, tạ ngang vai.', 'Đẩy lên thẳng đầu, hạ chậm.'], ['Ưỡn lưng', 'Khóa gối'], 'band_lateral_raise', 'Không phù hợp nếu đau vai hoặc có khuyến cáo hạn chế đưa tay qua đầu.', 4);
  E('band_lateral_raise', 'Nâng vai ngang với dây', 'vai', 'Vai giữa', 1, ['band'], 'reps', 3, 15, 45, [], true,
    ['Đứng lên giữa dây, hai tay cầm hai đầu.', 'Nâng tay sang ngang đến tầm vai, hạ chậm.'], ['Nhún vai', 'Vung tay'], null, '', 3);
  E('db_lateral_raise', 'Nâng tạ ngang vai', 'vai', 'Vai giữa', 1, ['dumbbell'], 'reps', 3, 12, 45, [], true,
    ['Tay cầm tạ nhẹ, khuỷu hơi gập.', 'Nâng sang ngang đến tầm vai rồi hạ chậm.'], ['Tạ quá nặng', 'Vung đà'], 'band_lateral_raise', '', 3);
  E('pike_pushup', 'Pike push-up', 'vai', 'Vai, tay sau', 2, ['none'], 'reps', 3, 8, 75, ['overhead', 'shoulder', 'wrist'], true,
    ['Tạo hình chữ V ngược, hông cao.', 'Hạ đỉnh đầu về phía sàn rồi đẩy lên.'], ['Hạ đầu xuống sàn đột ngột'], 'band_lateral_raise', 'Không phù hợp nếu đau vai/cổ tay.', 4);
  E('band_face_pull', 'Kéo dây về mặt (Face pull)', 'vai', 'Vai sau, đai xoay vai', 1, ['band'], 'reps', 3, 15, 45, [], true,
    ['Móc dây ngang tầm mặt ở cột/cửa chắc chắn.', 'Kéo về phía mặt, khuỷu cao, xoay ngoài vai.'], ['Dùng đà lưng'], null, '', 3);

  E('db_curl', 'Cuốn tạ tay trước', 'tay', 'Bắp tay trước', 1, ['dumbbell'], 'reps', 3, 12, 45, [], true,
    ['Đứng thẳng, khuỷu sát thân.', 'Cuốn tạ lên vai, hạ chậm.'], ['Vung lưng lấy đà'], 'band_curl', '', 3);
  E('band_curl', 'Cuốn dây tay trước', 'tay', 'Bắp tay trước', 1, ['band'], 'reps', 3, 15, 45, [], true,
    ['Đạp chân lên giữa dây, hai tay cầm hai đầu.', 'Cuốn lên rồi hạ chậm.'], ['Khuỷu bị đưa ra trước'], null, '', 3);
  E('bench_dip', 'Dips ghế (tay sau)', 'tay', 'Tay sau, ngực dưới', 2, ['none'], 'reps', 3, 10, 60, ['shoulder', 'wrist'], true,
    ['Chống tay lên mép ghế vững, chân duỗi/co.', 'Hạ người đến khuỷu 90° rồi đẩy lên.'], ['Hạ quá sâu gây đau vai'], 'band_pushdown', 'Không phù hợp nếu đau vai.', 4);
  E('db_tricep_ext', 'Duỗi tay sau qua đầu', 'tay', 'Tay sau', 2, ['dumbbell'], 'reps', 3, 10, 60, ['overhead'], true,
    ['Hai tay giữ một tạ sau đầu.', 'Duỗi tay lên cao, hạ chậm.'], ['Khuỷu mở rộng'], 'band_pushdown', 'Hạn chế nếu đau vai.', 3.5);
  E('band_pushdown', 'Ép dây tay sau', 'tay', 'Tay sau', 1, ['band'], 'reps', 3, 15, 45, [], true,
    ['Móc dây trên cao (cửa chắc), khuỷu sát thân.', 'Ép dây xuống duỗi thẳng tay.'], ['Nhún vai'], null, '', 3);

  E('plank', 'Plank', 'bung', 'Cơ lõi', 1, ['mat'], 'time', 3, 30, 45, [], true,
    ['Chống khuỷu tay dưới vai, thân thẳng.', 'Siết bụng, mông, giữ nhịp thở đều.'], ['Võng lưng', 'Chổng mông'], 'dead_bug', '', 3.5);
  E('dead_bug', 'Dead bug', 'bung', 'Cơ lõi sâu', 1, ['mat'], 'reps', 3, 10, 45, [], true,
    ['Nằm ngửa, tay chân giơ lên 90°.', 'Hạ tay và chân đối diện, giữ lưng dính sàn.'], ['Lưng cong khỏi sàn'], null, '', 3);
  E('crunch', 'Gập bụng', 'bung', 'Cơ bụng trên', 1, ['mat'], 'reps', 3, 15, 45, ['spine'], true,
    ['Nằm ngửa gối co, tay sau đầu nhẹ.', 'Nhấc vai khỏi sàn, siết bụng rồi hạ.'], ['Kéo cổ'], 'dead_bug', '', 3);
  E('bicycle_crunch', 'Đạp xe trên không', 'bung', 'Bụng chéo', 1, ['mat'], 'reps', 3, 20, 45, [], true,
    ['Nằm ngửa, xoay thân chạm khuỷu vào gối đối diện.'], ['Kéo cổ', 'Làm quá nhanh'], 'dead_bug', '', 3.5);
  E('leg_raise', 'Nâng chân', 'bung', 'Bụng dưới', 2, ['mat'], 'reps', 3, 12, 60, ['spine'], true,
    ['Nằm ngửa, nâng hai chân thẳng lên 90° rồi hạ chậm.'], ['Võng lưng khi hạ chân'], 'dead_bug', 'Dừng nếu đau thắt lưng.', 3.5);
  E('mountain_climber', 'Mountain climber', 'bung', 'Cơ lõi, tim phổi', 2, ['mat'], 'time', 3, 30, 45, ['intense', 'wrist'], false,
    ['Tư thế plank tay thẳng, lần lượt đưa gối về ngực.'], ['Mông nhô cao'], 'plank', 'Cường độ tim mạch cao.', 7);
  E('bird_dog', 'Bird dog', 'bung', 'Cơ lõi, lưng dưới', 1, ['mat'], 'reps', 3, 10, 45, [], true,
    ['Chống 4 điểm, duỗi tay phải – chân trái, giữ 2 giây rồi đổi bên.'], ['Xoay hông'], null, '', 3);

  E('bodyweight_squat', 'Squat thân người', 'chan', 'Đùi trước, mông', 1, ['none'], 'reps', 3, 12, 60, ['knee'], true,
    ['Đứng rộng bằng vai, đẩy hông ra sau.', 'Hạ đến khi đùi gần song song sàn, gối thẳng hướng mũi chân.'], ['Gối cụp vào trong', 'Nhấc gót'], 'glute_bridge', 'Giảm biên độ nếu đau gối.', 4.5);
  E('glute_bridge', 'Cầu mông', 'chan', 'Mông, đùi sau', 1, ['mat'], 'reps', 3, 15, 45, [], true,
    ['Nằm ngửa gối co, nâng hông cao rồi siết mông 1-2 giây.'], ['Ưỡn lưng thay vì dùng mông'], null, '', 3.5);
  E('lunge', 'Lunge (bước chùng)', 'chan', 'Đùi, mông', 2, ['none'], 'reps', 3, 10, 60, ['knee'], true,
    ['Bước dài về trước, hạ gối sau gần sàn.', 'Đẩy gót chân trước đứng lên.'], ['Gối trước vượt quá mũi chân nhiều'], 'glute_bridge', 'Không phù hợp nếu đau gối.', 4.5);
  E('goblet_squat', 'Goblet squat', 'chan', 'Đùi, mông, lõi', 2, ['dumbbell'], 'reps', 3, 10, 75, ['knee'], true,
    ['Ôm một tạ trước ngực.', 'Ngồi xuống sâu vừa phải, ngực thẳng.'], ['Gập người về trước'], 'bodyweight_squat', 'Giảm biên độ nếu đau gối.', 5);
  E('db_rdl', 'Romanian deadlift tạ đơn', 'chan', 'Đùi sau, mông, lưng dưới', 2, ['dumbbell'], 'reps', 3, 10, 75, ['spine'], true,
    ['Hai tay cầm tạ trước đùi, đẩy hông ra sau, lưng phẳng.', 'Hạ tạ đến gối rồi đứng lên bằng hông.'], ['Tròn lưng'], 'glute_bridge', 'Không phù hợp nếu có khuyến cáo hạn chế tải cột sống.', 5);
  E('wall_sit', 'Ngồi tựa tường', 'chan', 'Đùi trước', 1, ['none'], 'time', 3, 30, 45, ['knee'], true,
    ['Tựa lưng vào tường, đùi song song sàn, giữ yên.'], ['Gối vượt mũi chân'], 'glute_bridge', '', 3.5);
  E('step_up', 'Bước lên bậc', 'chan', 'Đùi, mông', 2, ['none'], 'reps', 3, 10, 60, ['knee'], true,
    ['Đặt cả bàn chân lên bậc vững, đẩy người lên rồi hạ chậm.'], ['Đẩy bằng chân sau'], 'glute_bridge', '', 4.5);
  E('calf_raise', 'Nhón gót', 'chan', 'Bắp chân', 1, ['none'], 'reps', 3, 15, 30, [], true,
    ['Đứng, nhón gót lên cao, hạ chậm.'], ['Làm quá nhanh'], null, '', 3);
  E('band_lateral_walk', 'Đi ngang với dây', 'chan', 'Mông giữa', 1, ['band'], 'reps', 3, 12, 45, [], true,
    ['Dây quanh đầu gối, hạ nhẹ gối, bước ngang giữ lực căng.'], ['Gối cụp vào'], null, '', 3.5);

  E('brisk_walk', 'Đi bộ nhanh', 'cardio', 'Tim phổi, chân', 1, ['none'], 'time', 1, 900, 0, [], true,
    ['Đi nhịp nhanh nhưng vẫn nói được thành câu.', 'Giữ lưng thẳng, vung tay tự nhiên.'], ['Bước quá dài'], null, '', 4);
  E('march_in_place', 'Đi bộ tại chỗ (êm)', 'cardio', 'Tim phổi', 1, ['none'], 'time', 3, 120, 30, [], true,
    ['Nâng gối cao vừa phải, vung tay nhịp nhàng, tiếp đất nhẹ.'], ['Dậm mạnh gây ồn'], null, 'Phù hợp ký túc xá/căn hộ.', 3.5);
  E('shadow_boxing', 'Đấm gió (Shadow boxing)', 'cardio', 'Tim phổi, vai', 1, ['none'], 'time', 3, 60, 30, [], true,
    ['Đứng chân rộng bằng vai, đấm thẳng/móc nhẹ, di chuyển trọng tâm.'], ['Khóa khuỷu khi đấm'], null, '', 5);
  E('incline_walk', 'Đi bộ dốc trên máy', 'cardio', 'Tim phổi, mông', 1, ['treadmill'], 'time', 1, 1200, 0, [], true,
    ['Đặt độ dốc 5–8%, tốc độ vừa phải, không vịn tay quá nhiều.'], ['Vịn chặt tay vịn'], null, '', 5);
  E('jog', 'Chạy bộ nhẹ', 'cardio', 'Tim phổi, chân', 2, ['none'], 'time', 1, 900, 0, ['knee', 'impact', 'intense'], false,
    ['Chạy nhịp vừa, tiếp đất giữa bàn chân, thở đều.'], ['Bước quá dài', 'Tăng quãng đường quá nhanh'], 'brisk_walk', 'Tải va đập lên khớp gối.', 8);
  E('jumping_jack', 'Jumping jack', 'cardio', 'Toàn thân', 1, ['none'], 'time', 3, 40, 30, ['impact', 'knee'], false,
    ['Nhảy mở chân – giơ tay, rồi khép lại.'], ['Tiếp đất cứng'], 'march_in_place', 'Ồn và có va đập.', 7);
  E('jump_rope', 'Nhảy dây', 'cardio', 'Tim phổi, bắp chân', 2, ['rope'], 'time', 4, 60, 30, ['impact', 'knee', 'intense'], false,
    ['Nhảy thấp, cổ tay xoay dây, tiếp đất bằng mũi bàn chân.'], ['Nhảy quá cao'], 'march_in_place', 'Va đập mạnh; cần sàn tốt.', 10);
  E('high_knees', 'Nâng cao gối', 'cardio', 'Tim phổi, đùi', 2, ['none'], 'time', 3, 30, 30, ['impact', 'knee', 'intense'], false,
    ['Chạy tại chỗ, nâng gối ngang hông.'], ['Ngả người ra sau'], 'march_in_place', '', 8);
  E('burpee', 'Burpee', 'toanthan', 'Toàn thân', 3, ['none'], 'reps', 3, 8, 75, ['impact', 'knee', 'shoulder', 'intense', 'wrist'], false,
    ['Ngồi xổm – chống tay – đá chân ra sau – hít đất – kéo chân về – bật lên.'], ['Võng lưng khi đá chân'], 'march_in_place', 'Rất nặng với tim mạch và khớp; chỉ dành cho người đã quen tập.', 10);
  E('squat_to_press', 'Squat đẩy tạ', 'toanthan', 'Toàn thân', 2, ['dumbbell'], 'reps', 3, 10, 75, ['knee', 'overhead'], true,
    ['Squat với tạ ngang vai, khi đứng lên đẩy tạ qua đầu.'], ['Gập lưng'], 'goblet_squat', '', 6);
  E('inchworm', 'Inchworm', 'toanthan', 'Đùi sau, lõi, vai', 2, ['mat'], 'reps', 3, 8, 45, ['wrist'], true,
    ['Gập người chạm sàn, bò tay ra plank, bò ngược về.'], ['Gối cong quá nhiều'], 'cat_cow', '', 4);

  E('cat_cow', 'Mèo – bò (Cat-Cow)', 'gian', 'Cột sống', 1, ['mat'], 'reps', 2, 10, 15, [], true,
    ['Chống 4 điểm, cong rồi võng lưng theo nhịp thở.'], ['Làm quá nhanh'], null, '', 2.3);
  E('child_pose', 'Tư thế em bé', 'gian', 'Lưng, hông', 1, ['mat'], 'time', 2, 40, 10, [], true,
    ['Quỳ, ngồi lên gót, duỗi tay về trước, thở sâu.'], ['Nín thở'], null, '', 2);
  E('hamstring_stretch', 'Giãn đùi sau', 'gian', 'Đùi sau', 1, ['mat'], 'time', 2, 30, 10, [], true,
    ['Ngồi duỗi một chân, nghiêng người từ hông tới bàn chân.'], ['Gù lưng để chạm chân'], null, '', 2);
  E('hip_flexor_stretch', 'Giãn gập hông', 'gian', 'Cơ gập hông', 1, ['mat'], 'time', 2, 30, 10, [], true,
    ['Quỳ một gối, đẩy hông về trước nhẹ nhàng.'], ['Võng lưng'], null, '', 2);
  E('chest_stretch', 'Giãn ngực ở khung cửa', 'gian', 'Ngực, vai trước', 1, ['none'], 'time', 2, 30, 10, [], true,
    ['Đặt cẳng tay lên khung cửa, bước nhẹ về trước.'], ['Kéo quá căng'], null, '', 2);
  E('band_external_rotation', 'Xoay ngoài vai với dây (đai xoay vai)', 'gian', 'Đai xoay vai', 1, ['band'], 'reps', 2, 15, 20, [], true,
    ['Khuỷu sát thân gập 90°, xoay cẳng tay ra ngoài chống lực dây.'], ['Khuỷu rời thân'], null, 'Bài nhẹ cho vai.', 2.5);
  E('neck_shoulder_release', 'Thả lỏng cổ – vai', 'gian', 'Cổ, vai', 1, ['none'], 'time', 2, 30, 10, [], true,
    ['Nghiêng đầu sang bên, thả vai, thở sâu; đổi bên.'], ['Dùng tay kéo mạnh'], null, 'Hữu ích cho người ngồi lâu.', 2);

  var PRODUCT_CATS = { band: 'Dây kháng lực', dumbbell: 'Tạ tay', mat: 'Thảm tập', pullup: 'Xà đơn', treadmill: 'Máy chạy bộ', cardio: 'Thiết bị cardio', recovery: 'Dụng cụ phục hồi', supp: 'Thực phẩm bổ sung' };
  /* P(id, tên, nhóm, giá VNĐ, mô tả, dụng cụ mở khóa, mục tiêu, không gian, ưu tiên, icon, thông số, hướng dẫn, đối tượng, lưu ý) */
  var P = [];
  function Pr(id, name, cat, price, desc, unlocks, goals, space, prio, icon, specs, how, forWho, note) {
    P.push({ id: id, name: name, cat: cat, price: price, desc: desc, unlocks: unlocks, goals: goals, space: space, prio: prio, icon: icon, specs: specs, how: how, forWho: forWho, note: note || '' });
  }
  var G_ALL = ['fatloss', 'muscle', 'endurance', 'health'];
  Pr('band-set3', 'Set 3 dây kháng lực', 'band', 129000, 'Ba mức lực, dùng cho cả thân trên và thân dưới.', 'band', G_ALL, 'small', 'essential', 'gesture', ['3 mức lực: nhẹ/vừa/nặng', 'Chất liệu latex', 'Gọn trong ba lô'], 'Móc dây vào cửa/cột chắc chắn, bắt đầu với mức nhẹ.', 'Người mới, ở phòng nhỏ, ngân sách thấp.', 'Kiểm tra dây không rạn nứt trước mỗi buổi.');
  Pr('band-loop', 'Vòng dây mông (loop band)', 'band', 79000, 'Kích hoạt cơ mông, hỗ trợ tập chân.', 'band', ['muscle', 'health'], 'small', 'consider', 'circle', ['Vải co giãn', '3 mức lực'], 'Đặt trên gối khi tập cầu mông, đi ngang.', 'Người tập chân/mông.');
  Pr('db-adj', 'Tạ tay điều chỉnh 2×10kg', 'dumbbell', 690000, 'Một cặp tạ đổi được nhiều mức nặng.', 'dumbbell', ['muscle', 'fatloss'], 'medium', 'consider', 'fitness_center', ['2 tạ, mỗi tạ 2–10kg', 'Khóa vặn'], 'Siết chặt khóa trước khi tập.', 'Người đã quen tập, có chỗ cất.');
  Pr('db-hex5', 'Cặp tạ tay cao su 5kg', 'dumbbell', 380000, 'Tạ cố định, bền, không lăn.', 'dumbbell', ['muscle', 'fatloss', 'health'], 'medium', 'consider', 'fitness_center', ['2 × 5kg', 'Bọc cao su'], 'Bắt đầu với tạ nhẹ, tăng dần.', 'Người muốn tăng cơ cơ bản.');
  Pr('db-pair-2', 'Cặp tạ tay nhẹ 2kg', 'dumbbell', 160000, 'Dành cho người mới và bài vai/tay.', 'dumbbell', ['health', 'fatloss'], 'small', 'consider', 'fitness_center', ['2 × 2kg'], 'Dùng cho nâng vai ngang, cuốn tạ.', 'Người mới, nữ, người hồi phục.');
  Pr('mat-8', 'Thảm tập TPE 8mm', 'mat', 199000, 'Chống trượt, đệm đủ cho bài sàn.', 'mat', G_ALL, 'small', 'essential', 'rectangle', ['Dày 8mm', '183×61cm', 'TPE'], 'Trải trên sàn phẳng, lau sau khi tập.', 'Mọi người, nhất là tập trong phòng nhỏ.');
  Pr('mat-10', 'Thảm tập 10mm có dây đeo', 'mat', 249000, 'Dày hơn, êm cho đầu gối.', 'mat', ['health', 'endurance'], 'small', 'optional', 'rectangle', ['Dày 10mm', 'Có dây đeo']);
  Pr('pullup-door', 'Xà đơn gắn cửa', 'pullup', 349000, 'Hít xà và các bài lưng/tay.', 'pullup', ['muscle'], 'medium', 'optional', 'horizontal_rule', ['Chịu tải 150kg', 'Gắn khung cửa'], 'Kiểm tra khung cửa chắc chắn, làm theo hướng dẫn lắp.', 'Người đã có nền sức mạnh.', 'Không dùng nếu khung cửa lỏng hoặc đau vai.');
  Pr('treadmill-fold', 'Máy chạy bộ gấp gọn', 'treadmill', 5490000, 'Đi bộ/chạy trong nhà.', 'treadmill', ['fatloss', 'endurance'], 'large', 'optional', 'directions_run', ['Công suất 2HP', 'Gấp gọn'], 'Bắt đầu với đi bộ nhanh, tăng dốc dần.', 'Có ngân sách và chỗ đặt.', 'Chi phí cao, cân nhắc đi bộ/chạy ngoài trời trước.');
  Pr('rope-speed', 'Dây nhảy tốc độ', 'cardio', 69000, 'Cardio chi phí thấp, cần ít không gian.', 'rope', ['fatloss', 'endurance'], 'small', 'consider', 'sync_alt', ['Dây thép bọc', 'Chỉnh độ dài'], 'Nhảy thấp, tiếp đất mũi chân.', 'Người khớp gối ổn.', 'Va đập mạnh, ồn khi nhảy sàn cứng.');
  Pr('step-board', 'Bậc step aerobic', 'cardio', 290000, 'Bước lên/xuống tập chân và cardio nhẹ.', null, ['fatloss', 'endurance'], 'medium', 'optional', 'stairs', ['Điều chỉnh 2 độ cao']);
  Pr('foam-roller', 'Con lăn foam 33cm', 'recovery', 159000, 'Thả lỏng cơ sau tập.', null, ['health', 'muscle'], 'small', 'optional', 'sports_gymnastics', ['33cm', 'Mật độ trung bình']);
  Pr('massage-ball', 'Bóng massage 2 trái', 'recovery', 59000, 'Giảm căng cơ vai, bàn chân.', null, ['health'], 'small', 'optional', 'sports_baseball', ['2 bóng cao su']);
  Pr('stretch-strap', 'Dây giãn cơ', 'recovery', 89000, 'Hỗ trợ giãn cơ đùi sau, vai.', null, ['health'], 'small', 'optional', 'straighten', ['Dài 180cm']);
  Pr('whey-1kg', 'Whey protein 1kg (thực phẩm bổ sung)', 'supp', 890000, 'Bổ sung đạm khi khẩu phần ăn chưa đủ.', null, ['muscle'], 'small', 'optional', 'water_drop', ['1kg', '~30 lần dùng'], 'Theo hướng dẫn trên bao bì.', 'Người ăn khó đủ đạm.', 'Thực phẩm bổ sung, không phải thuốc. Không có tác dụng điều trị.');
  Pr('oat-1kg', 'Yến mạch cán dẹt 1kg', 'supp', 98000, 'Tinh bột chậm, giàu chất xơ cho bữa sáng.', null, ['health', 'fatloss', 'endurance'], 'small', 'consider', 'grain', ['1kg'], 'Nấu cháo hoặc ngâm qua đêm.', 'Mọi người.', 'Thực phẩm bổ sung, không phải thuốc.');
  Pr('multivit', 'Vitamin tổng hợp (thực phẩm bổ sung)', 'supp', 250000, 'Hỗ trợ bổ sung vi chất khi ăn thiếu đa dạng.', null, ['health'], 'small', 'optional', 'medication', ['60 viên'], 'Theo hướng dẫn trên nhãn.', 'Người ăn uống chưa đa dạng.', 'Thực phẩm bổ sung, không phải thuốc. Hỏi ý kiến bác sĩ nếu đang điều trị bệnh.');
  Pr('shaker', 'Bình lắc 600ml', 'supp', 49000, 'Pha đồ uống protein.', null, ['muscle'], 'small', 'optional', 'water_bottle', ['600ml', 'Có lưới']);

  var MEALS = [];
  /* M(id, tên, bữa, kcal, protein(g), chi phí tham khảo, thành phần) */
  function M(id, name, slot, kcal, p, cost, ing, icon) { MEALS.push({ id: id, name: name, slot: slot, kcal: kcal, protein: p, cost: cost, ing: ing, icon: icon || 'restaurant' }); }
  M('m1', 'Bánh mì trứng ốp la + dưa leo', 'sang', 420, 18, 22000, ['1/2 ổ bánh mì', '2 trứng', 'dưa leo'], 'bakery_dining');
  M('m2', 'Cháo yến mạch chuối + sữa chua', 'sang', 350, 14, 18000, ['yến mạch 50g', 'chuối', 'sữa chua không đường'], 'breakfast_dining');
  M('m3', 'Phở gà (ít bánh phở)', 'sang', 380, 25, 40000, ['bánh phở', 'thịt gà', 'hành, rau thơm'], 'ramen_dining');
  M('m4', 'Xôi đậu xanh + trứng luộc', 'sang', 480, 17, 20000, ['xôi', 'đậu xanh', '1 trứng'], 'rice_bowl');
  M('m5', 'Sữa chua, trái cây & hạt', 'sang', 280, 12, 25000, ['sữa chua', 'trái cây', 'hạt'], 'nutrition');
  M('m6', 'Cơm gạo lứt, ức gà luộc, rau muống xào tỏi', 'trua', 520, 38, 45000, ['gạo lứt', 'ức gà', 'rau muống'], 'lunch_dining');
  M('m7', 'Cơm cá thu kho, canh bí đỏ, dưa leo', 'trua', 560, 34, 40000, ['cơm', 'cá thu', 'bí đỏ'], 'set_meal');
  M('m8', 'Cơm thịt nạc kho trứng, canh cải', 'trua', 600, 32, 38000, ['cơm', 'thịt nạc', 'trứng', 'cải'], 'set_meal');
  M('m9', 'Đậu hũ sốt cà chua, cơm, rau luộc', 'trua', 480, 22, 30000, ['đậu hũ', 'cà chua', 'cơm', 'rau'], 'set_meal');
  M('m10', 'Gỏi gà xé phay', 'trua', 380, 30, 42000, ['ức gà', 'bắp cải', 'rau răm'], 'salad');
  M('m11', 'Bún chả (ít bún)', 'trua', 580, 30, 55000, ['bún', 'thịt nướng', 'rau sống'], 'ramen_dining');
  M('m12', 'Canh chua cá lóc + cơm', 'toi', 520, 33, 50000, ['cá lóc', 'cà chua, dứa', 'cơm'], 'soup_kitchen');
  M('m13', 'Bò xào rau muống + cơm', 'toi', 600, 35, 60000, ['thịt bò', 'rau muống', 'cơm'], 'dinner_dining');
  M('m14', 'Trứng chiên rau củ + cơm', 'toi', 480, 22, 28000, ['trứng', 'rau củ', 'cơm'], 'egg_alt');
  M('m15', 'Tôm rang + cơm + rau luộc', 'toi', 510, 30, 55000, ['tôm', 'cơm', 'rau'], 'dinner_dining');
  M('m16', 'Salad ức gà & trứng', 'toi', 350, 32, 45000, ['ức gà', 'trứng', 'rau xà lách'], 'salad');
  M('m17', 'Khoai lang luộc + trứng luộc', 'toi', 330, 14, 15000, ['khoai lang', '1 trứng'], 'egg_alt');
  M('m18', 'Chuối', 'phu', 100, 1, 8000, ['1 quả chuối'], 'nutrition');
  M('m19', 'Sữa đậu nành không đường (1 ly)', 'phu', 90, 7, 10000, ['sữa đậu nành'], 'local_drink');
  M('m20', 'Trứng luộc (2 quả)', 'phu', 140, 12, 7000, ['2 trứng'], 'egg');
  M('m21', 'Hạt hỗn hợp (1 nắm nhỏ)', 'phu', 170, 5, 15000, ['hạt'], 'spa');
  M('m22', 'Sữa chua không đường', 'phu', 100, 6, 10000, ['sữa chua'], 'icecream');

  var CHALLENGES = [
    { id: 'c7', name: 'Thử thách 7 ngày liên tiếp', days: 7, goal: 7, metric: 'streak', desc: 'Tập ít nhất một buổi mỗi ngày trong 7 ngày liên tiếp (có thể là bài giãn cơ nhẹ).', reward: 'Huy hiệu "Bền bỉ 7"', demoMembers: 1284 },
    { id: 'c30', name: 'Thử thách 30 ngày – 12 buổi', days: 30, goal: 12, metric: 'sessions30', desc: 'Hoàn thành 12 buổi tập trong 30 ngày gần nhất.', reward: 'Huy hiệu "Kiên trì 30"', demoMembers: 942 },
    { id: 'c10', name: '10 buổi trong 4 tuần', days: 28, goal: 10, metric: 'sessions28', desc: 'Giữ nhịp ổn định: 10 buổi trong 28 ngày.', reward: '', demoMembers: 611 },
    { id: 'cstand', name: 'Giảm ngồi lâu: đứng dậy mỗi giờ', days: 7, goal: 7, metric: 'manual', desc: 'Mỗi ngày tự đánh dấu đã đứng dậy vận động nhẹ mỗi giờ làm việc.', reward: '', demoMembers: 530 }
  ];
  var BADGES = [
    { id: 'first', name: 'Buổi tập đầu tiên', icon: 'flag', test: 'sessions>=1' },
    { id: 'streak3', name: 'Chuỗi 3 ngày', icon: 'local_fire_department', test: 'streak>=3' },
    { id: 'streak7', name: 'Chuỗi 7 ngày', icon: 'whatshot', test: 'streak>=7' },
    { id: 'ten', name: '10 buổi hoàn thành', icon: 'military_tech', test: 'sessions>=10' },
    { id: 'hours5', name: '5 giờ vận động', icon: 'timer', test: 'minutes>=300' },
    { id: 'weigh', name: 'Ghi cân nặng lần đầu', icon: 'monitor_weight', test: 'metrics>=1' },
    { id: 'goal', name: 'Chạm mục tiêu cân nặng', icon: 'emoji_events', test: 'goalReached' }
  ];
  var DEMO_USERS = [
    { id: 'u1', name: 'Trần Tuấn Khang', streak: 12, sessions: 31, points: 940 },
    { id: 'u2', name: 'Lê Thu Hà', streak: 9, sessions: 27, points: 860 },
    { id: 'u3', name: 'Phạm Quốc Bảo', streak: 6, sessions: 22, points: 700 },
    { id: 'u4', name: 'Nguyễn Hải Yến', streak: 15, sessions: 35, points: 1010 },
    { id: 'u5', name: 'Võ Minh Đức', streak: 3, sessions: 14, points: 420 },
    { id: 'u6', name: 'Đặng Khánh Linh', streak: 5, sessions: 18, points: 560 }
  ];
  var DEMO_POSTS = [
    { id: 'dp1', by: 'u1', topic: 'Hành trình', text: 'Tuần thứ 6 tập tại nhà với dây kháng lực và tạ 5kg. Cảm giác khoẻ hơn nhiều, ngủ ngon hơn!', likes: 24, ago: 3 * 3600e3 },
    { id: 'dp2', by: 'u2', topic: 'Kỹ thuật', text: 'Mình hay bị cụp gối khi squat. Mọi người có mẹo nào để giữ gối thẳng hướng mũi chân không?', likes: 11, ago: 20 * 3600e3 },
    { id: 'dp3', by: 'u4', topic: 'Dinh dưỡng', text: 'Meal prep món Việt cho 3 ngày: ức gà luộc, rau muống, cơm gạo lứt. Chi phí khoảng 45k/bữa.', likes: 37, ago: 30 * 3600e3 },
    { id: 'dp4', by: 'u3', topic: 'Thành tích', text: 'Hoàn thành thử thách 7 ngày liên tiếp! Cảm ơn mọi người đã động viên 💪', likes: 52, ago: 52 * 3600e3 }
  ];
  var DEMO_COMMENTS = { dp2: [{ by: 'u1', text: 'Thử đặt dây loop quanh gối để nhắc cơ mông hoạt động nhé.', ago: 18 * 3600e3 }] };

  var D = { CATS: CATS, CAT_ICON: CAT_ICON, EQUIP: EQUIP, LEVELS: LEVELS, EXERCISES: X, PRODUCT_CATS: PRODUCT_CATS, PRODUCTS: P, MEALS: MEALS,
    CHALLENGES: CHALLENGES, BADGES: BADGES, DEMO_USERS: DEMO_USERS, DEMO_POSTS: DEMO_POSTS, DEMO_COMMENTS: DEMO_COMMENTS,
    GOALS: { fatloss: 'Giảm mỡ', muscle: 'Tăng cơ', endurance: 'Tăng sức bền', health: 'Nâng cao sức khỏe chung' },
    ACTIVITY: { 1: 'Ít vận động (ngồi văn phòng)', 2: 'Nhẹ (1–3 buổi/tuần)', 3: 'Vừa (3–5 buổi/tuần)', 4: 'Cao (6–7 buổi/tuần)' },
    PLACES: { home: 'Tại nhà', dorm: 'Ký túc xá / phòng nhỏ', outdoor: 'Ngoài trời', gym: 'Phòng gym' } };
  D.exById = function (id) { return X.filter(function (e) { return e.id === id; })[0] || null; };
  D.productById = function (id) { return P.filter(function (e) { return e.id === id; })[0] || null; };
  if (typeof module !== 'undefined' && module.exports) module.exports = D; else root.DISCI_DATA = D;
})(typeof window !== 'undefined' ? window : globalThis);
