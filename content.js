// Helper function to delay execution
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoLikeRight() {
  while (true) {
    let settings;
    try {
      settings = await new Promise((resolve, reject) => {
        if (!chrome.runtime?.id) {
          reject(new Error("Extension context invalidated"));
          return;
        }
        chrome.storage.local.get(["autoLike", "autoDislike", "delayTime"], resolve);
      });
    } catch (error) {
      console.log("Extension context lost, stopping auto-swiper");
      return;
    }

    const { autoLike, autoDislike, delayTime } = settings;

    const likeButton = document.getElementsByClassName(
      "button Lts($ls-s) Z(0) CenterAlign Mx(a) Cur(p) Tt(u) Bdrs(50%) P(0) Fw($semibold) focus-button-style Bxsh($bxsh-btn) Expand Trstf(e) Trsdu($normal) Wc($transform) Pe(a) Scale(1.1):h Scale(.9):a Bgi($g-ds-background-like):a"
    )[0];

    const dislikeButton = document.getElementsByClassName(
      "button Lts($ls-s) Z(0) CenterAlign Mx(a) Cur(p) Tt(u) Bdrs(50%) P(0) Fw($semibold) focus-button-style Bxsh($bxsh-btn) Expand Trstf(e) Trsdu($normal) Wc($transform) Pe(a) Scale(1.1):h Scale(.9):a Bgi($g-ds-background-nope):a"
    )[0];

    if (autoLike && autoDislike) {
      const randomAction = Math.random() < 0.5 ? 'like' : 'dislike';
      if (randomAction === 'like' && likeButton) {
        likeButton.click();
        console.log("Liked (random)");
      } else if (randomAction === 'dislike' && dislikeButton) {
        dislikeButton.click();
        console.log("Disliked (random)");
      }
    } else if (autoLike && !autoDislike && likeButton) {
      likeButton.click();
      console.log("Liked");
    } else if (!autoLike && autoDislike && dislikeButton) {
      dislikeButton.click();
      console.log("Disliked");
    }

    await sleep(parseInt(delayTime, 10) * 1000 || 1000);
  }
}

autoLikeRight();
//