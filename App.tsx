import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Switch,
  Linking,
  Alert,
  ActivityIndicator,
  ProgressBarAndroid,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';

// إعداد الإشعارات للتنزيل بالخلفية
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [qualities, setQualities] = useState<{ quality: string; url: string }[]>([]);
  const [episodes, setEpisodes] = useState<{ title: string; url: string }[]>([]);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  // حالة نافذة التليجرام
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const TELEGRAM_CHANNEL_URL = 'https://t.me/MrAiko1';

  useEffect(() => {
    checkTelegramModalPermission();
    requestPermissions();
  }, []);

  // طلب أذونات الحفظ والإشعارات
  const requestPermissions = async () => {
    await MediaLibrary.requestPermissionsAsync();
    await Notifications.requestPermissionsAsync();
  };

  // التحقق من خيار عدم إظهار نافذة التليجرام مجدداً
  const checkTelegramModalPermission = async () => {
    try {
      const hideModal = await AsyncStorage.getItem('hide_telegram_modal');
      if (hideModal !== 'true') {
        setShowTelegramModal(true);
      }
    } catch (error) {
      console.log(error);
    }
  };

  // إغلاق نافذة التليجرام وتطبيق خيار الحفظ
  const handleCloseTelegramModal = async () => {
    if (dontShowAgain) {
      await AsyncStorage.setItem('hide_telegram_modal', 'true');
    }
    setShowTelegramModal(false);
  };

  // فتح قناة التليجرام
  const handleOpenTelegram = () => {
    Linking.openURL(TELEGRAM_CHANNEL_URL);
    handleCloseTelegramModal();
  };

  // معالجة الرابط واستخراج الحلقات أو الجودات
  const handleFetchMedia = async () => {
    if (!url.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال رابط الفيديو أو المسلسل أولاً');
      return;
    }

    setLoading(true);
    setQualities([]);
    setEpisodes([]);

    try {
      const response = await fetch(url);
      const htmlText = await response.text();

      // محاكاة استخراج قائمة الحلقات إذا كان الرابط يحتوي على مسلسل
      const episodeMatches = Array.from(htmlText.matchAll(/href="([^"]*episode-[^"]*)"/g));
      if (episodeMatches.length > 0) {
        const extractedEpisodes = episodeMatches.slice(0, 20).map((match, index) => ({
          title: `الحلقة ${index + 1}`,
          url: match[1].startsWith('http') ? match[1] : `${url}${match[1]}`,
        }));
        setEpisodes(extractedEpisodes);
      }

      // استخراج الجودات المتاحة (1080p, 720p, 360p...)
      const qualityMatches = Array.from(htmlText.matchAll(/href="([^"]*\.(mp4|m3u8)[^"]*)"/g));
      if (qualityMatches.length > 0) {
        const extractedQualities = [
          { quality: '1080p Full HD', url: qualityMatches[0]?.[1] || url },
          { quality: '720p HD', url: qualityMatches[1]?.[1] || url },
          { quality: '360p SD', url: qualityMatches[2]?.[1] || url },
        ];
        setQualities(extractedQualities);
      } else {
        // جودة افتراضية
        setQualities([{ quality: 'الجودة الأساسية (المتاحة)', url: url }]);
      }
    } catch (error) {
      Alert.alert('خطأ', 'فشل جلب تفاصيل الرابط، يرجى التأكد من صحة الرابط');
    } finally {
      setLoading(false);
    }
  };

  // بدء التنزيل المباشر في المجلد العام وإظهار الإشعار
  const startDownload = async (downloadUrl: string, label: string) => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const fileName = `Vodu_Video_${Date.now()}.mp4`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        fileUri,
        {},
        (downloadProgressData) => {
          const progress =
            downloadProgressData.totalBytesWritten /
            downloadProgressData.totalBytesExpectedToWrite;
          setDownloadProgress(progress);

          // تحديث الإشعار بالتقدم
          Notifications.scheduleNotificationAsync({
            content: {
              title: 'جاري التنزيل...',
              body: `نسبة الأكتمال: ${Math.round(progress * 100)}%`,
            },
            trigger: null,
          });
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (result?.uri) {
        // حفظ الملف مباشرة بمعرض الهاتف / التنزيلات العامة
        const asset = await MediaLibrary.createAssetAsync(result.uri);
        await MediaLibrary.createAlbumAsync('Vodu Downloads', asset, false);

        Notifications.scheduleNotificationAsync({
          content: {
            title: 'اكتمل التنزيل بنجاح! 🎉',
            body: 'تم حفظ الفيديو داخل مجلد التنزيلات والمعرض على جهازك.',
          },
          trigger: null,
        });

        Alert.alert('نجاح', 'تم تنزيل الفيديو وحفظه مباشرة في جهازك!');
      }
    } catch (error) {
      Alert.alert('خطأ التنزيل', 'حدث خطأ أثناء تنزيل الملف بالخلفية');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Vodu Video Downloader</Text>
      <Text style={styles.subHeader}>تطوير: MrAiko1</Text>

      {/* حقل الرابط */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="أدخل رابط الفيلم أو المسلسل..."
          placeholderTextColor="#888"
          value={url}
          onChangeText={setUrl}
        />
        <TouchableOpacity style={styles.fetchButton} onPress={handleFetchMedia}>
          <Text style={styles.buttonText}>فحص الرابط</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="large" color="#a855f7" style={{ marginVertical: 20 }} />}

      {/* شريط تقدم التنزيل */}
      {isDownloading && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>جاري التنزيل: {Math.round(downloadProgress * 100)}%</Text>
          {Platform.OS === 'android' && (
            <ProgressBarAndroid styleAttr="Horizontal" indeterminate={false} progress={downloadProgress} color="#a855f7" />
          )}
        </View>
      )}

      <ScrollView style={styles.scrollArea}>
        {/* قائمة الحلقات إن وجدت */}
        {episodes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>الحلقات المتاحة:</Text>
            <View style={styles.grid}>
              {episodes.map((ep, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.episodeCard}
                  onPress={() => {
                    setUrl(ep.url);
                    handleFetchMedia();
                  }}>
                  <Text style={styles.episodeText}>{ep.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* قائمة الجودات المتاحة */}
        {qualities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>اختر الجودة للتنزيل:</Text>
            {qualities.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.qualityButton}
                onPress={() => startDownload(item.url, item.quality)}>
                <Text style={styles.qualityText}>تنزيل بجودة ({item.quality})</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* زر الوصول المباشر لقناة التليجرام */}
      <TouchableOpacity style={styles.telegramBanner} onPress={handleOpenTelegram}>
        <Text style={styles.telegramBannerText}>📢 انضم لقناتنا على التليجرام: @MrAiko1</Text>
      </TouchableOpacity>

      {/* نافذة التليجرام الترويجية (Pop-up Modal) */}
      <Modal visible={showTelegramModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalLogo}>📢 MR AIKO</Text>
              <Text style={styles.modalSubLogo}>Official Telegram Channel</Text>
            </View>

            <Text style={styles.modalDescription}>
              اشترك في قناتنا الرسمية على التليجرام للحصول على أحدث التحديثات والروابط المباشرة!
            </Text>

            <View style={styles.switchRow}>
              <Switch value={dontShowAgain} onValueChange={setDontShowAgain} trackColor={{ true: '#a855f7' }} />
              <Text style={styles.switchLabel}>Don't show again</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.closeBtn} onPress={handleCloseTelegramModal}>
                <Text style={styles.closeBtnText}>CLOSE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.downloadBtn} onPress={handleOpenTelegram}>
                <Text style={styles.downloadBtnText}>JOIN NOW ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingTop: 50, paddingHorizontal: 16 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subHeader: { fontSize: 14, color: '#a855f7', textAlign: 'center', marginBottom: 20 },
  inputContainer: { flexDirection: 'row', gap: 8, marginBottom: 15 },
  input: { flex: 1, backgroundColor: '#1e293b', borderRadius: 8, paddingHorizontal: 12, color: '#fff', height: 48 },
  fetchButton: { backgroundColor: '#a855f7', borderRadius: 8, justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  progressContainer: { padding: 12, backgroundColor: '#1e293b', borderRadius: 8, marginBottom: 15 },
  progressText: { color: '#fff', marginBottom: 8, textAlign: 'center' },
  scrollArea: { flex: 1 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#38bdf8', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  episodeCard: { backgroundColor: '#1e293b', padding: 12, borderRadius: 8, minWidth: '30%', alignItems: 'center' },
  episodeText: { color: '#fff', fontSize: 13 },
  qualityButton: { backgroundColor: '#22c55e', padding: 14, borderRadius: 8, marginBottom: 8, alignItems: 'center' },
  qualityText: { color: '#fff', fontWeight: 'bold' },
  telegramBanner: { backgroundColor: '#0284c7', padding: 12, borderRadius: 8, marginBottom: 20, alignItems: 'center' },
  telegramBannerText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  // تنسيقات النافذة الترحيبية (Modal)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '85%', backgroundColor: '#1e1b4b', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#a855f7' },
  modalHeader: { backgroundColor: '#9333ea', width: '100%', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 15 },
  modalLogo: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  modalSubLogo: { fontSize: 12, color: '#e9d5ff' },
  modalDescription: { color: '#cbd5e1', textAlign: 'center', marginBottom: 15, fontSize: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', marginBottom: 20 },
  switchLabel: { color: '#94a3b8', fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
  closeBtn: { flex: 1, backgroundColor: '#475569', padding: 12, borderRadius: 8, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontWeight: 'bold' },
  downloadBtn: { flex: 1, backgroundColor: '#2563eb', padding: 12, borderRadius: 8, alignItems: 'center' },
  downloadBtnText: { color: '#fff', fontWeight: 'bold' },
});
