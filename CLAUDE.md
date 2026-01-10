# G-DEAL 웹 프로젝트 지침

## 중요: 샌드박스 비활성화 필수 작업

다음 작업 수행 시 **반드시 `dangerouslyDisableSandbox: true`** 옵션을 사용해야 합니다:

### Git 작업
```bash
git add, git commit, git push, git pull, git fetch
```

### Firebase 배포
```bash
firebase deploy
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

### 이유
- 샌드박스 모드에서는 네트워크 접근이 제한되어 원격 저장소 연결 및 Firebase API 호출이 실패함
- 컨텍스트 압축 후에도 이 규칙을 반드시 기억할 것

## 프로젝트 정보

- **Firebase 프로젝트**: gdeal-page-a67e2
- **호스팅 URL**: https://gdeal-page-a67e2.web.app
- **기술 스택**: Next.js (정적 빌드), Firebase Hosting, Firestore, FCM

## 배포 명령어

```bash
# 호스팅만 배포
firebase deploy --only hosting

# 전체 배포
firebase deploy
```
