(() => {
  function initializeGame() {
    const canvas = document.getElementById('game');

    if (!canvas || canvas.dataset.initialized === 'true') return;

    const ctx = canvas.getContext('2d');
    const statusLabel = document.getElementById('status');

    if (!ctx) {
      statusLabel.textContent =
        'Oyun alanı açılamadı. Güncel bir tarayıcı kullanın.';
      return;
    }

    canvas.dataset.initialized = 'true';

    const scoreLabel = document.getElementById('score');
    const bestLabel = document.getElementById('best');
    const livesLabel = document.getElementById('lives');
    const levelLabel = document.getElementById('level');
    const overlay = document.getElementById('overlay');
    const message = document.getElementById('message');
    const detail = document.getElementById('detail');
    const startButton = document.getElementById('start');
    const restartButton = document.getElementById('restart');

    const paddle = {
      x: 344,
      y: 476,
      width: 112,
      height: 14,
      speed: 440
    };

    const ball = {
      x: 400,
      y: 450,
      radius: 8,
      dx: 0,
      dy: 0
    };

    const colors = ['#fc7aab', '#b49aff', '#69baff', '#7cead4'];
    const keys = { left: false, right: false, fire: false };
    const storageKey = 'tuglaKirmaRekor';

    let bricks = [];
    let score = 0;
    let best = 0;
    let lives = 3;
    let level = 1;
    let running = false;
    let lastTime = 0;
    let animationId = null;
    let launchDelay = 0;
    let audio = null;

    let gifts = [];
    let bullets = [];
    let brokenCount = 0;
    let sizeTime = 0;
    let fireTime = 0;
    let shotCooldown = 0;
    let muzzleTime = 0;
    let layoutName = 'Klasik';

    const giftTypes = [
      { type: 'grow', label: 'BÜYÜT', color: '#7cead4' },
      { type: 'shrink', label: 'KÜÇÜLT', color: '#fc7aab' },
      { type: 'fire', label: 'ATEŞ', color: '#ffcf69' },
      { type: 'skip', label: 'SEVİYE +', color: '#b49aff' }
    ];

    // Tarayıcı depolaması kapalıysa oyun yine çalışır.
    try {
      const saved = Number(localStorage.getItem(storageKey));

      if (Number.isSafeInteger(saved) && saved >= 0) {
        best = saved;
      }
    } catch (error) {
      // Rekoru bu oturum için bellekte tut.
    }

    function updateLabels() {
      scoreLabel.textContent = score;
      bestLabel.textContent = best;
      livesLabel.textContent = lives;
      levelLabel.textContent = level;
    }

    function saveBest() {
      if (score <= best) return;

      best = score;

      try {
        localStorage.setItem(storageKey, String(best));
      } catch (error) {
        // Depolama izni yoksa oyunu durdurma.
      }
    }

    function enableSound() {
      try {
        const AudioContext =
          window.AudioContext || window.webkitAudioContext;

        if (!AudioContext) return;

        if (!audio) {
          audio = new AudioContext();
        }

        if (audio.state === 'suspended') {
          audio.resume().catch(() => {});
        }
      } catch (error) {
        // Ses desteklenmiyorsa sessiz oyna.
      }
    }

    function playBrickSound() {
      if (!audio || audio.state !== 'running') return;

      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const now = audio.currentTime;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        440,
        now + 0.08
      );

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

      oscillator.connect(gain);
      gain.connect(audio.destination);

      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };

      oscillator.start(now);
      oscillator.stop(now + 0.11);
    }

    // Her seviyede top biraz hızlanır.
    function ballSpeed() {
      return 330 + (level - 1) * 25;
    }

    function createBricks() {
      bricks = [];

      // İki seviyede bir sıra ekle, en fazla yedi sıra olsun.
      const rows = Math.min(
        7,
        4 + Math.floor((level - 1) / 2)
      );

      const pattern = (level - 1) % 5;
      const cycle = Math.floor((level - 1) / 5);
      const names = [
        'Klasik',
        'Şaşırtmalı',
        'Elmas',
        'Koridor',
        'Dalga'
      ];

      layoutName = names[pattern];

      // Seviye 3: bazı tuğlalar 2 vuruş.
      // Seviye 5 ve sonrası: bazı tuğlalar 3 vuruş.
      const maxHp = Math.min(
        3,
        1 + Math.floor((level - 1) / 2)
      );

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < 8; column++) {
          // Elmas şeklinin dışında kalan tuğlaları oluşturma.
          if (pattern === 2) {
            const reach = 1 + Math.min(row, rows - 1 - row);

            if (Math.abs(column - 3.5) > reach) continue;
          }

          // Koridor düzeninde bazı sütunlarda boşluk bırak.
          if (
            pattern === 3 &&
            row % 2 === 0 &&
            (column === 2 || column === 5)
          ) {
            continue;
          }

          let x = 32 + column * 93;
          let y = 48 + row * 34;

          // Satırları sağa ve sola kaydır.
          if (pattern === 1) {
            x += row % 2 === 0 ? -8 : 8;
          }

          // Sütunları dalga şeklinde yerleştir.
          if (pattern === 4) {
            y += Math.round(Math.sin(column * 0.9 + level) * 12);
          }

          // Düzen tekrarlandığında konum ve renkleri değiştir.
          x += (cycle % 3) * 4;
          y += (cycle % 3) * 5;

          const armored = (row + column + level) % 3 === 0;
          const hp = armored ? maxHp : 1;

          bricks.push({
            x,
            y,
            width: 85,
            height: 24,
            color: colors[(row + cycle) % colors.length],
            hp,
            active: true
          });
        }
      }
    }

    function resetBall() {
      paddle.x = (canvas.width - paddle.width) / 2;

      ball.x = canvas.width / 2;
      ball.y = paddle.y - ball.radius - 12;
      ball.dx = ballSpeed() * 0.55;
      ball.dy = -Math.sqrt(ballSpeed() ** 2 - ball.dx ** 2);

      keys.left = false;
      keys.right = false;

      // Oyuncuya hazırlanması için bir saniye ver.
      launchDelay = 1;
    }

    function clearBonuses() {
      gifts = [];
      bullets = [];
      sizeTime = 0;
      fireTime = 0;
      shotCooldown = 0;
      muzzleTime = 0;
      paddle.width = 112;
      keys.fire = false;
    }

    function resizePaddle(width) {
      const center = paddle.x + paddle.width / 2;

      paddle.width = width;
      paddle.x = Math.max(
        0,
        Math.min(canvas.width - width, center - width / 2)
      );
    }

    function breakBrick(brick) {
      brick.hp--;
      playBrickSound();

      // Dayanıklı tuğla henüz kırılmadı.
      if (brick.hp > 0) return false;

      brick.active = false;
      score += 10;
      brokenCount++;

      saveBest();
      updateLabels();

      // Sadece tamamen kırılan tuğlalar hediye sayacına eklenir.
      if (brokenCount % 4 === 0) {
        const kind =
          giftTypes[Math.floor(Math.random() * giftTypes.length)];

        gifts.push({
          ...kind,
          x: brick.x + brick.width / 2 - 32,
          y: brick.y,
          width: 64,
          height: 24
        });
      }

      return bricks.every(item => !item.active);
    }

    function applyGift(type) {
      if (type === 'skip') {
        nextLevel();
        return true;
      }

      if (type === 'fire') {
        fireTime = 10;
        statusLabel.textContent =
          'Ateş açık! 10 saniye boyunca BOŞLUK tuşuna basılı tut.';
      } else {
        resizePaddle(type === 'grow' ? 168 : 76);
        sizeTime = 10;

        statusLabel.textContent = type === 'grow'
          ? 'Raket 10 saniyeliğine büyüdü!'
          : 'Dikkat! Raket 10 saniyeliğine küçüldü!';
      }

      return false;
    }

    // Namlular ve mermiler aynı merkez noktalarını kullanır.
    function gunPositions() {
      return [
        paddle.x + 10,
        paddle.x + paddle.width - 10
      ];
    }

    function overlaps(a, b) {
      return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      );
    }

    function updateBonuses(seconds) {
      if (sizeTime > 0) {
        sizeTime = Math.max(0, sizeTime - seconds);

        if (sizeTime === 0) {
          resizePaddle(112);
        }
      }

      fireTime = Math.max(0, fireTime - seconds);
      shotCooldown = Math.max(0, shotCooldown - seconds);
      muzzleTime = Math.max(0, muzzleTime - seconds);

      // Hediyeleri aşağı hareket ettir.
      for (let i = gifts.length - 1; i >= 0; i--) {
        const gift = gifts[i];
        gift.y += 130 * seconds;

        if (overlaps(gift, paddle)) {
          gifts.splice(i, 1);

          if (applyGift(gift.type)) return true;
        } else if (gift.y > canvas.height) {
          gifts.splice(i, 1);
        }
      }

      // Ateş hediyesi etkinken iki namludan mermi çıkar.
      if (
        fireTime > 0 &&
        keys.fire &&
        shotCooldown === 0 &&
        launchDelay === 0
      ) {
        for (const x of gunPositions()) {
          bullets.push({
            x: x - 2,
            y: paddle.y - 30,
            width: 4,
            height: 12
          });
        }

        shotCooldown = 0.25;
        muzzleTime = 0.07;
      }

      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.y -= 600 * seconds;

        const brick = bricks.find(
          item => item.active && overlaps(bullet, item)
        );

        if (brick) {
          bullets.splice(i, 1);

          if (breakBrick(brick)) {
            nextLevel();
            return true;
          }
        } else if (bullet.y + bullet.height < 0) {
          bullets.splice(i, 1);
        }
      }

      return false;
    }

    // Gölge ve açık/koyu kenarlar ile basit 3D görünüm.
    function drawBlock(x, y, width, height, color) {
      ctx.fillStyle = '#00000060';
      ctx.fillRect(x + 3, y + 4, width, height);

      ctx.fillStyle = color;
      ctx.fillRect(x, y, width, height);

      ctx.fillStyle = '#ffffff50';
      ctx.fillRect(x, y, width, 3);
      ctx.fillRect(x, y, 2, height);

      ctx.fillStyle = '#00000035';
      ctx.fillRect(x, y + height - 3, width, 3);
      ctx.fillRect(x + width - 3, y, 3, height);
    }

    function drawGuns() {
      if (fireTime <= 0) return;

      for (const x of gunPositions()) {
        // Namlunun rakete bağlandığı alt bölüm.
        drawBlock(
          x - 6,
          paddle.y - 3,
          12,
          10,
          '#eab65b'
        );

        // Metalik namlu.
        drawBlock(
          x - 4,
          paddle.y - 20,
          8,
          22,
          '#8ca8c7'
        );

        // Sarı namlu ucu ve koyu açıklık.
        ctx.fillStyle = '#ffcf69';
        ctx.fillRect(x - 5, paddle.y - 22, 10, 4);

        ctx.fillStyle = '#26324b';
        ctx.fillRect(x - 2, paddle.y - 22, 4, 2);

        // Ateş sırasında kısa parlama.
        if (muzzleTime > 0) {
          ctx.shadowBlur = 18;
          ctx.shadowColor = '#ffcf69';
          ctx.fillStyle = '#fff3c2';

          ctx.beginPath();
          ctx.moveTo(x - 5, paddle.y - 24);
          ctx.lineTo(x, paddle.y - 38);
          ctx.lineTo(x + 5, paddle.y - 24);
          ctx.fill();

          ctx.shadowBlur = 0;
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ffffff0b';

      for (let x = 20; x < canvas.width; x += 24) {
        for (let y = 20; y < canvas.height; y += 24) {
          ctx.fillRect(x, y, 2, 2);
        }
      }

      // Bölümün düzen adı.
      ctx.font = '12px Arial';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#aab8d2';
      ctx.fillText(
        `Seviye ${level} · ${layoutName}`,
        24,
        23
      );

      ctx.textAlign = 'right';
      ctx.fillText(
        'Çizgili tuğlalar: 2–3 vuruş',
        canvas.width - 24,
        23
      );

      for (const brick of bricks) {
        if (!brick.active) continue;

        drawBlock(
          brick.x,
          brick.y,
          brick.width,
          brick.height,
          brick.color
        );

        // Kalan dayanıklılık kadar küçük zırh çizgisi.
        if (brick.hp > 1) {
          ctx.fillStyle = '#ffffffcc';

          for (let i = 0; i < brick.hp; i++) {
            ctx.fillRect(
              brick.x + 9 + i * 10,
              brick.y + 9,
              5,
              6
            );
          }
        }
      }

      ctx.shadowBlur = 12;
      ctx.shadowColor = '#7cead4';

      drawBlock(
        paddle.x,
        paddle.y,
        paddle.width,
        paddle.height,
        '#7cead4'
      );

      ctx.shadowBlur = 0;
      drawGuns();

      // Topun parlak yüzeyi.
      const shine = ctx.createRadialGradient(
        ball.x - 3,
        ball.y - 3,
        1,
        ball.x,
        ball.y,
        ball.radius
      );

      shine.addColorStop(0, '#ffffff');
      shine.addColorStop(1, '#9fc8ec');

      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = shine;
      ctx.fill();

      ctx.fillStyle = '#ffcf69';

      for (const bullet of bullets) {
        ctx.fillRect(
          bullet.x,
          bullet.y,
          bullet.width,
          bullet.height
        );
      }

      ctx.textAlign = 'center';
      ctx.font = 'bold 11px Arial';

      for (const gift of gifts) {
        drawBlock(
          gift.x,
          gift.y,
          gift.width,
          gift.height,
          gift.color
        );

        ctx.fillStyle = '#0b1122';
        ctx.fillText(
          gift.label,
          gift.x + gift.width / 2,
          gift.y + 16
        );
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = '#d9e5ff';
      ctx.font = '13px Arial';

      const effects = [];

      if (sizeTime > 0) {
        effects.push(
          `${paddle.width > 112 ? 'Büyük' : 'Küçük'} raket: ${Math.ceil(sizeTime)} sn`
        );
      }

      if (fireTime > 0) {
        effects.push(`Ateş [BOŞLUK]: ${Math.ceil(fireTime)} sn`);
      }

      ctx.fillText(
        effects.join('  •  '),
        24,
        canvas.height - 14
      );
    }

    function loseLife() {
      clearBonuses();
      lives--;
      updateLabels();

      if (lives > 0) {
        resetBall();
        statusLabel.textContent =
          `Bir can gitti! ${lives} canın kaldı. Hazırlan!`;
        return;
      }

      running = false;
      startButton.disabled = false;

      overlay.querySelector('.badge').textContent = 'BİR TUR DAHA?';
      message.textContent = 'Oyun bitti!';
      detail.textContent =
        `Puanın: ${score}. Rekor: ${best}. Yeniden Başlat ile tekrar dene.`;

      overlay.classList.remove('hidden');
      statusLabel.textContent =
        'Canların bitti. Yeni bir oyun başlatabilirsin.';
    }

    function nextLevel() {
      level++;

      clearBonuses();
      createBricks();
      resetBall();
      updateLabels();

      statusLabel.textContent =
        `Seviye ${level}: ${layoutName}. Yeni dizilim, daha hızlı top!`;
    }

    function update(seconds) {
      if (updateBonuses(seconds)) return;

      if (keys.left) paddle.x -= paddle.speed * seconds;
      if (keys.right) paddle.x += paddle.speed * seconds;

      paddle.x = Math.max(
        0,
        Math.min(canvas.width - paddle.width, paddle.x)
      );

      if (launchDelay > 0) {
        launchDelay = Math.max(0, launchDelay - seconds);
        return;
      }

      const previousX = ball.x;
      const previousY = ball.y;

      ball.x += ball.dx * seconds;
      ball.y += ball.dy * seconds;

      // Sol ve sağ duvar.
      if (
        ball.x < ball.radius ||
        ball.x > canvas.width - ball.radius
      ) {
        ball.x = Math.max(
          ball.radius,
          Math.min(canvas.width - ball.radius, ball.x)
        );

        ball.dx *= -1;
      }

      // Üst duvar.
      if (ball.y < ball.radius) {
        ball.y = ball.radius;
        ball.dy = Math.abs(ball.dy);
      }

      // Raketle çarpışma.
      if (
        ball.dy > 0 &&
        previousY + ball.radius <= paddle.y &&
        ball.y + ball.radius >= paddle.y &&
        ball.x + ball.radius >= paddle.x &&
        ball.x - ball.radius <= paddle.x + paddle.width
      ) {
        ball.y = paddle.y - ball.radius;

        const hit = Math.max(
          -1,
          Math.min(
            1,
            (ball.x - (paddle.x + paddle.width / 2)) /
              (paddle.width / 2)
          )
        );

        ball.dx = hit * ballSpeed() * 0.88;
        ball.dy = -Math.sqrt(ballSpeed() ** 2 - ball.dx ** 2);
      }

      for (const brick of bricks) {
        if (!brick.active) continue;

        const nearX = Math.max(
          brick.x,
          Math.min(ball.x, brick.x + brick.width)
        );

        const nearY = Math.max(
          brick.y,
          Math.min(ball.y, brick.y + brick.height)
        );

        if (
          (ball.x - nearX) ** 2 + (ball.y - nearY) ** 2 >
          ball.radius ** 2
        ) {
          continue;
        }

        const cleared = breakBrick(brick);

        if (
          previousX + ball.radius <= brick.x ||
          previousX - ball.radius >= brick.x + brick.width
        ) {
          ball.dx *= -1;
        } else {
          ball.dy *= -1;
        }

        ball.x = previousX;
        ball.y = previousY;

        if (cleared) {
          nextLevel();
          return;
        }

        break;
      }

      if (ball.y - ball.radius > canvas.height) {
        loseLife();
      }
    }

    function frame(time) {
      if (!running) return;

      let remaining = Math.min((time - lastTime) / 1000, 0.04);
      lastTime = time;

      while (remaining > 0 && running) {
        // Küçük adımlar topun ve mermilerin tuğlaları atlamasını önler.
        const step = Math.min(remaining, 1 / 240, 4 / ballSpeed());

        update(step);
        remaining -= step;
      }

      draw();

      animationId = running ? requestAnimationFrame(frame) : null;
    }

    function startGame() {
      cancelAnimationFrame(animationId);
      enableSound();

      score = 0;
      lives = 3;
      level = 1;
      brokenCount = 0;

      clearBonuses();
      createBricks();
      resetBall();
      updateLabels();

      overlay.classList.add('hidden');
      startButton.disabled = true;
      statusLabel.textContent =
        'Her 4 tuğlada bir hediye! Düşen kutuları raketle yakala.';

      running = true;
      canvas.focus({ preventScroll: true });
      lastTime = performance.now();

      draw();
      animationId = requestAnimationFrame(frame);
    }

    startButton.addEventListener('click', startGame);
    restartButton.addEventListener('click', startGame);

    window.addEventListener('keydown', event => {
      if (event.code === 'Space' && running) {
        event.preventDefault();
        keys.fire = true;
      }

      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight'
      ) {
        event.preventDefault();
        keys[event.key === 'ArrowLeft' ? 'left' : 'right'] = true;
      }
    });

    window.addEventListener('keyup', event => {
      if (event.code === 'Space') keys.fire = false;
      if (event.key === 'ArrowLeft') keys.left = false;
      if (event.key === 'ArrowRight') keys.right = false;
    });

    window.addEventListener('blur', () => {
      keys.left = false;
      keys.right = false;
      keys.fire = false;
    });

    createBricks();
    resetBall();
    updateLabels();
    draw();
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initializeGame,
      { once: true }
    );
  } else {
    initializeGame();
  }
})();