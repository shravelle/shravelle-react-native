# React Native

```bash
npm install ./sdks/shravelle-sdk-react-native @react-native-async-storage/async-storage
```
```js
import Shravelle from "@shravelle/react-native";
Shravelle.init({ endpoint: "https://ingest.example.com", key: "shv_brw_xxx", app: "shop-rn", release: "2.1.0",
               tracePropagationTargets: ["api.example.com"] });
<NavigationContainer onStateChange={Shravelle.navigationStateChange}>…</NavigationContainer>
Shravelle.setUser(id); Shravelle.track("coupon_applied", { code: "DIWALI" }); Shravelle.recordError(err);
```
Captures fatal and non-fatal JS errors (global handler), unhandled promise rejections, fetch/XHR with
traceparent, screens, sessions (new after 30 min in background), app start. The queue is persisted in
AsyncStorage. Native crashes need the [Android](https://shravelle.com/docs.html#mobile)/[iOS](https://shravelle.com/docs.html#mobile) SDKs in the native projects.
Status: not run in this build environment.


---
Part of [Shravelle](https://shravelle.com). Setup guide for every platform: [shravelle.com/docs](https://shravelle.com/docs.html) · Get your keys: [shravelle.com/get-started](https://shravelle.com/get-started.html)
