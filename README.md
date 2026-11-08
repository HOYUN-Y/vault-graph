# Vault Graph

Markdown 색인과 문서 관계를 3D 복셀 그래프로 보여 주는 로컬 웹앱입니다. 5,000개 가상 문서 데모와 검색·문서 선택·이름표 켬/끔을 지원합니다.

## 설치 및 실행

Node.js 22.12 이상이 필요합니다.

```bash
git clone https://github.com/HOYUN-Y/vault-graph.git
cd vault-graph
npm ci
npm run build
npm run preview
```

브라우저에서 http://127.0.0.1:5181 을 엽니다. 개발 모드는 `npm run dev`입니다.

설정 없이 데모를 사용할 수 있습니다. 실제 볼트는 `settings.example.json`을 `settings.json`으로 복사하고 `vaultPath`에 절대경로를 넣어 연결합니다. `CLAUDE.md` 라우터와 Markdown 색인 구조를 지원하며, 원문은 읽기 전용입니다.

이름표는 화면의 **이름표** 단추 또는 **L** 키로 켜고 끕니다. 글꼴 라이선스는 `public/fonts/licenses/`에 있습니다.
