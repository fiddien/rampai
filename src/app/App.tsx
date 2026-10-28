import { useCallback, useEffect, useMemo, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications, notifications } from "@mantine/notifications";
import { loadDeviceKey } from "../sync/keys";
import { getDraft, type Store } from "../sync/library";
import { storagePersists } from "../sync/storage";
import { AppContext, sessionStore, type AppContextValue, type Device } from "./context";
import { go, parseRoute, useHash } from "./router";
import { cssVariables, theme } from "./theme";
import { LibraryPage } from "../ui/LibraryPage";
import { WritingPage } from "../ui/WritingPage";
import { ConfirmPage, PairPage, RecoveryPage, WelcomePage } from "../ui/Onboarding";
import { LinkPage, PENDING_LINK_CODE } from "../ui/LinkPage";
import { BackupPage } from "../ui/BackupPage";

function Redirect({ to }: { to: string }) {
  useEffect(() => go(to), [to]);
  return null;
}

function Pages({ device, store }: { device: Device | undefined; store: Store }) {
  const hash = useHash();
  const route = parseRoute(hash);
  const persists = useMemo(() => storagePersists(), []);
  // Back to the top of the page on every page change, and the interface shows again.
  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.classList.remove("typing");
  }, [hash]);

  switch (route.page) {
    // Setting up devices is open to everyone, with or without a key.
    case "welcome":
      return <WelcomePage />;
    case "recovery":
      return <RecoveryPage />;
    case "confirm":
      return <ConfirmPage />;
    case "pair":
      return <PairPage />;
  }
  // Everything else needs a key, so a first visit starts at the welcome. When this browser keeps
  // nothing, a key could never be kept, so the writer goes straight to writing, with a warning.
  if (!device && persists) {
    // A link code scanned before this device was set up waits for it.
    if (route.page === "link" && route.code) sessionStore().setItem(PENDING_LINK_CODE, route.code);
    return <Redirect to="#/welcome" />;
  }
  switch (route.page) {
    case "link":
      return device ? <LinkPage code={route.code} /> : <Redirect to="#/" />;
    case "backup":
      return device ? <BackupPage /> : <Redirect to="#/" />;
    case "draft":
      return route.id && getDraft(store, route.id) ? <WritingPage key={route.id} id={route.id} /> : <LibraryPage />;
    default:
      // A link code scanned before this device was set up: go on to linking now that it is.
      if (device?.source === "passphrase" && sessionStore().getItem(PENDING_LINK_CODE)) return <Redirect to="#/link" />;
      return <LibraryPage />;
  }
}

export function App({ store }: { store: Store }) {
  const [device, setDevice] = useState<Device | undefined>();
  const [loaded, setLoaded] = useState(false);
  const refreshDevice = useCallback(async () => {
    setDevice(await loadDeviceKey(store));
    setLoaded(true);
  }, [store]);
  useEffect(() => {
    void refreshDevice();
  }, [refreshDevice]);

  const value = useMemo<AppContextValue>(
    () => ({
      store,
      session: sessionStore(),
      device,
      refreshDevice,
      persists: storagePersists(),
      go,
      say: (message) => notifications.show({ message, autoClose: 2600, withCloseButton: false, position: "top-center" }),
    }),
    [store, device, refreshDevice],
  );

  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariables} defaultColorScheme="auto">
      <ModalsProvider>
        <Notifications position="top-center" limit={2} />
        <AppContext.Provider value={value}>{loaded && <Pages device={device} store={store} />}</AppContext.Provider>
      </ModalsProvider>
    </MantineProvider>
  );
}
