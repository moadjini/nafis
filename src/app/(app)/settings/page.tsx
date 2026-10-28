import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getNotificationPreferences, listBlockedUsers } from "@/lib/data";
import { serverEnv } from "@/lib/env.server";
import { getI18n, getTheme } from "@/lib/i18n/server";
import {
  BlockedList,
  DataAndAccount,
  HiddenTopicsForm,
  LanguageAndThemeForm,
  NotificationPreferencesForm,
  ProfileForm,
} from "@/components/settings/settings-forms";
import { AvatarUploader } from "@/components/settings/avatar-uploader";
import { PushSettings } from "@/components/settings/push-settings";
import { PageHeader, Section } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.settings.title };
}

export default async function SettingsPage() {
  const [profile, { t }, theme] = await Promise.all([requireProfile(), getI18n(), getTheme()]);
  const [notificationPrefs, blocked] = await Promise.all([getNotificationPreferences(profile.id), listBlockedUsers()]);

  return (
    <>
      <PageHeader title={t.settings.title} />
      <Section id="picture" title={t.avatarUpload.title}>
        <AvatarUploader name={profile.display_name} avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} />
      </Section>
      <Section id="profile" title={t.settings.profileSection}>
        <ProfileForm
          initial={{ displayName: profile.display_name, handle: profile.handle, avatarKey: profile.avatar_key, bio: profile.bio }}
          hasPicture={Boolean(profile.avatar_path)}
        />
      </Section>
      <Section id="appearance" title={`${t.settings.languageSection} · ${t.settings.appearanceSection}`}>
        <LanguageAndThemeForm theme={theme} />
      </Section>
      <Section id="notifications" title={t.settings.notificationsSection}>
        <div className="space-y-3">
          <PushSettings userId={profile.id} />
          <NotificationPreferencesForm initial={notificationPrefs} />
        </div>
      </Section>
      <Section id="content" title={t.settings.contentSection} description={t.settings.hiddenTopics}>
        <HiddenTopicsForm initial={profile.hidden_topics} />
      </Section>
      <Section id="listening" title={t.settings.listeningSection}>
        <Link href="/listening?view=private" className="text-sm font-medium text-primary-text hover:underline">
          {t.settings.listeningLink} →
        </Link>
      </Section>
      <Section id="privacy" title={t.settings.privacySection} description={t.settings.privacyBody}>
        <Link href="/privacy" className="text-sm font-medium text-primary-text hover:underline">
          {t.settings.privacyLink} →
        </Link>
      </Section>
      <Section id="blocked" title={t.settings.blockedSection}>
        <BlockedList blocked={blocked} />
      </Section>
      <Section id="account" title={t.settings.dataSection}>
        <DataAndAccount deletionAvailable={Boolean(serverEnv.serviceRoleKey)} />
      </Section>
    </>
  );
}
