// 크롬의 '데스크톱 사이트'가 켜지면 휴대폰에서도 약 980px 너비로 그려져 화면이 작게 보인다.
// 터치 기기인데 레이아웃 너비가 화면 너비보다 훨씬 넓으면 그 상태로 본다.
export function looksLikeDesktopMode({ innerWidth, screenWidth, coarsePointer }) {
  return coarsePointer && innerWidth > screenWidth * 1.5;
}
