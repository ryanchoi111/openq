import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { SignOutButton } from '../../components/SignOutButton';
import { profileService } from '../../services/profileService';
import { getGmailConnectionStatus, getTourRequests, connectGmailAccount, setupGmailWatch, backfillTourRequests } from '../../services/gmailService';
import { supabase } from '../../config/supabase';
import type { TourRequest } from '../../types/gmail';
import { colors, typography, spacing, radii, getInitials, getAvatarColor } from '../../utils/theme';

type Props = NativeStackScreenProps<AgentStackParamList, 'Profile'>;

interface PropertyGroup {
    propertyAddress: string;
    requests: TourRequest[];
    mostRecent: TourRequest;
    sources: ('zillow' | 'streeteasy')[];
}

const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { user, refreshUserProfile, deleteAccount } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadingApplication, setUploadingApplication] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [tourRequests, setTourRequests] = useState<TourRequest[]>([]);
  const [loadingTours, setLoadingTours] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [tourPage, setTourPage] = useState(0);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const tourListRef = useRef<FlatList>(null);
  const [calLink, setCalLink] = useState((user && 'cal_link' in user ? user.cal_link : '') || '');
  const [savingCalLink, setSavingCalLink] = useState(false);

  const PAGE_SIZE = 5;

  

  const propertyGroups = useMemo(() => {
    const groupMap = new Map<string, TourRequest[]>();
    for (const req of tourRequests) {
      const key = req.propertyAddress || 'Unknown Address';
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(req);
    }

    const groups: PropertyGroup[] = [];
    for (const [address, requests] of groupMap) {
      const sorted = [...requests].sort(
        (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );
      const sourceSet = new Set<'zillow' | 'streeteasy'>();
      for (const r of requests) {
        if (r.source) sourceSet.add(r.source);
      }
      groups.push({
        propertyAddress: address,
        requests: sorted,
        mostRecent: sorted[0],
        sources: Array.from(sourceSet),
      });
    }
    return groups;
  }, [tourRequests]);

  const sortedGroups = useMemo(() => {
    return [...propertyGroups].sort((a, b) => {
      const diff =
        new Date(b.mostRecent.receivedAt).getTime() -
        new Date(a.mostRecent.receivedAt).getTime();
      return sortNewestFirst ? diff : -diff;
    });
  }, [propertyGroups, sortNewestFirst]);

  const totalPages = Math.ceil(sortedGroups.length / PAGE_SIZE);

  const groupPages = useMemo(() => {
    const pages: PropertyGroup[][] = [];
    for (let i = 0; i < sortedGroups.length; i += PAGE_SIZE) {
      pages.push(sortedGroups.slice(i, i + PAGE_SIZE));
    }
    return pages;
  }, [sortedGroups]);

  const onTourPageChange = useCallback((e: any) => {
    const pageIndex = Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width);
    setTourPage(pageIndex);
  }, []);

  const handleSaveCalLink = async () => {
    if (!user) return;
    setSavingCalLink(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ cal_link: calLink.trim() || null })
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw error;
      refreshUserProfile().catch(() => {});
      Alert.alert('Saved', 'Cal.com link updated');
    } catch (err) {
      console.error('Error saving cal link:', err);
      Alert.alert('Error', 'Failed to save cal.com link');
    } finally {
      setSavingCalLink(false);
    }
  };

  const loadZillowData = useCallback(async () => {
    if (!user || user.role !== 'agent') return;
    setLoadingTours(true);
    try {
      const connection = await getGmailConnectionStatus(user.id);
      setGmailConnected(!!connection && !connection.needsReauth);
      if (connection && !connection.needsReauth) {
        const tours = await getTourRequests(user.id);
        setTourRequests(tours);
      }
    } catch (err) {
      console.error('Error loading Zillow data:', err);
    } finally {
      setLoadingTours(false);
    }
  }, [user]);

  useEffect(() => {
    loadZillowData();
  }, [loadZillowData]);

  const handleConnectGmail = async () => {
    if (!user) return;
    setConnectingGmail(true);
    try {
      const result = await connectGmailAccount(user.id);
      if (result.success) {
        Alert.alert('Success', 'Gmail connected');
        await loadZillowData();
      } else {
        Alert.alert('Error', result.error || 'Failed to connect Gmail');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to connect Gmail');
    } finally {
      setConnectingGmail(false);
    }
  };

  const handleBackfill = async () => {
    if (!user) return;
    setBackfilling(true);
    try {
      const result = await backfillTourRequests(user.id);
      if (result.success) {
        Alert.alert('Backfill Complete', `Found ${result.tourRequestsFound || 0} tour requests`);
        await loadZillowData();
      } else {
        Alert.alert('Error', result.error || 'Backfill failed');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to backfill tour requests');
    } finally {
      setBackfilling(false);
    }
  };

  const handleReconnectGmail = async () => {
    if (!user) return;
    setConnectingGmail(true);
    try {
      const result = await setupGmailWatch(user.id);
      if (result.success) {
        Alert.alert('Success', 'Gmail watch renewed');
        await loadZillowData();
      } else {
        Alert.alert('Error', result.error || 'Failed to renew Gmail watch');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to renew Gmail watch');
    } finally {
      setConnectingGmail(false);
    }
  };

  const handleEditProfilePicture = () => {
    Alert.alert(
      'Change Profile Picture',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: () => handleImagePicker('camera'),
        },
        {
          text: 'Choose from Library',
          onPress: () => handleImagePicker('library'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleImagePicker = async (source: 'camera' | 'library') => {
    try {
      let result;

      if (source === 'camera') {
        // Request camera permissions
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera permission is required to take photos');
          return;
        }

        // Launch camera
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        // Request media library permissions
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Photo library permission is required to choose photos');
          return;
        }

        // Launch image library
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        await uploadProfilePicture(imageUri);
      }
    } catch (error: any) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadProfilePicture = async (imageUri: string) => {
    if (!user?.id) return;

    try {
      setUploading(true);
      const updatedUser = await profileService.updateProfilePicture(user.id, imageUri);

      // Refresh the user profile to update the UI with new profile picture
      await refreshUserProfile();

      Alert.alert('Success', 'Profile picture updated successfully!');
    } catch (error: any) {
      console.error('Error uploading profile picture:', error);
      Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleUploadApplication = async () => {
    if (!user?.id) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const document = result.assets[0];

        // Validate file size (max 10MB)
        if (document.size && document.size > 10 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Please select a PDF file smaller than 10MB');
          return;
        }

        setUploadingApplication(true);
        await profileService.updateHousingApplication(user.id, document.uri);

        // Refresh the user profile
        await refreshUserProfile();

        Alert.alert('Success', 'Housing application uploaded successfully!');
      }
    } catch (error: any) {
      console.error('Error uploading application:', error);
      Alert.alert('Error', 'Failed to upload housing application. Please try again.');
    } finally {
      setUploadingApplication(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and will permanently delete all your data.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              Alert.alert('Success', 'Your account has been deleted successfully.');
            } catch (error: any) {
              console.error('Error deleting account:', error);
              Alert.alert('Error', 'Failed to delete account. Please try again.');
            }
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>No user data available</Text>
        </View>
      </SafeAreaView>
    );
  }

  const avatarColor = getAvatarColor(user.name || 'U');
  const initials = getInitials(user.name || 'U');

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Picture Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            {user.role !== 'guest' && user.profile_picture ? (
              <Image
                source={{ uri: user.profile_picture }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            {uploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="large" color={colors.navy900} />
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.editButton}
            onPress={handleEditProfilePicture}
            disabled={uploading}
          >
            <Ionicons name="camera" size={20} color={colors.navy900} />
            <Text style={styles.editButtonText}>Edit Profile Picture</Text>
          </TouchableOpacity>
        </View>

        {/* User Information */}
        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <Text style={styles.label}>NAME</Text>
            <Text style={styles.value}>{user.name}</Text>
          </View>

          {user.email && (
            <View style={styles.infoCard}>
              <Text style={styles.label}>EMAIL</Text>
              <Text style={styles.value}>{user.email}</Text>
            </View>
          )}

          <View style={styles.infoCard}>
            <Text style={styles.label}>ROLE</Text>
            <Text style={styles.value}>
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </Text>
          </View>
        </View>

        {/* Housing Application Section (for agents only) */}
        {user.role === 'agent' && (
          <View style={styles.applicationSection}>
            <Text style={styles.sectionTitle}>Housing Application</Text>
            <View style={styles.applicationCard}>
              {user.housing_application_url ? (
                <>
                  <View style={styles.applicationInfo}>
                    <Ionicons name="document-text" size={40} color={colors.navy400} />
                    <View style={styles.applicationTextContainer}>
                      <Text style={styles.applicationText}>Application uploaded</Text>
                      <Text style={styles.applicationSubtext}>
                        This will be sent to prospective tenants
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={handleUploadApplication}
                    disabled={uploadingApplication}
                  >
                    {uploadingApplication ? (
                      <ActivityIndicator size="small" color={colors.navy900} />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload" size={20} color={colors.navy900} />
                        <Text style={styles.uploadButtonText}>Replace Application</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.applicationInfo}>
                    <Ionicons name="document-text-outline" size={40} color={colors.ink400} />
                    <View style={styles.applicationTextContainer}>
                      <Text style={styles.applicationText}>No application uploaded</Text>
                      <Text style={styles.applicationSubtext}>
                        Upload a PDF to send to tenants
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={handleUploadApplication}
                    disabled={uploadingApplication}
                  >
                    {uploadingApplication ? (
                      <ActivityIndicator size="small" color={colors.navy900} />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload" size={20} color={colors.navy900} />
                        <Text style={styles.uploadButtonText}>Upload Application</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Edit Email Template Button */}
            <TouchableOpacity
              style={styles.emailTemplateButton}
              onPress={() => navigation.navigate('EditEmailTemplate')}
            >
              <Ionicons name="mail-outline" size={20} color={colors.navy900} />
              <Text style={styles.emailTemplateButtonText}>Edit Email Template</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.ink400} />
            </TouchableOpacity>
          </View>
        )}

        {/* Cal.com Link Section (agents only) */}
        {user.role === 'agent' && (
          <View style={styles.calLinkSection}>
            <Text style={styles.sectionTitle}>Scheduling Link</Text>
            <View style={styles.calLinkRow}>
              <TextInput
                style={[
                  styles.calLinkInput,
                  calLink.trim() ? styles.calLinkInputFilled : null,
                ]}
                value={calLink}
                onChangeText={setCalLink}
                placeholder="https://cal.com/your-link"
                placeholderTextColor={colors.ink400}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <TouchableOpacity
                style={styles.calLinkSaveButton}
                onPress={handleSaveCalLink}
                disabled={savingCalLink}
              >
                {savingCalLink ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.calLinkSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Tour Requests Section (agents only) */}
        {user.role === 'agent' && (
          <View style={styles.zillowSection}>
            <Text style={styles.sectionTitle}>Tour Requests</Text>
            {!gmailConnected ? (
              <TouchableOpacity
                style={styles.connectGmailButton}
                onPress={handleConnectGmail}
                disabled={connectingGmail}
              >
                {connectingGmail ? (
                  <ActivityIndicator size="small" color={colors.navy900} />
                ) : (
                  <>
                    <Ionicons name="mail" size={20} color={colors.navy900} />
                    <Text style={styles.connectGmailText}>Connect Gmail</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <View style={styles.gmailActions}>
                  <TouchableOpacity
                    style={styles.reconnectGmailButton}
                    onPress={handleReconnectGmail}
                    disabled={connectingGmail}
                  >
                    {connectingGmail ? (
                      <ActivityIndicator size="small" color={colors.ink600} />
                    ) : (
                      <>
                        <Ionicons name="refresh" size={16} color={colors.ink600} />
                        <Text style={styles.reconnectGmailText}>Reconnect</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.reconnectGmailButton}
                    onPress={handleBackfill}
                    disabled={backfilling}
                  >
                    {backfilling ? (
                      <ActivityIndicator size="small" color={colors.ink600} />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={16} color={colors.ink600} />
                        <Text style={styles.reconnectGmailText}>Sync Past Emails</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                {loadingTours ? (
                  <ActivityIndicator size="small" color={colors.navy900} style={{ marginVertical: spacing.lg }} />
                ) : tourRequests.length === 0 ? (
                  <View style={styles.emptyTours}>
                    <Ionicons name="mail-unread-outline" size={32} color={colors.ink400} />
                    <Text style={styles.emptyToursText}>No tour requests yet</Text>
                    <Text style={styles.emptyToursSubtext}>
                      Emails from Zillow and StreetEasy will appear here automatically
                    </Text>
                  </View>
                ) : (
                  <>
                    {/* Sort toggle + count */}
                    <View style={styles.tourListHeader}>
                      <Text style={styles.tourCount}>
                        {sortedGroups.length} {sortedGroups.length === 1 ? 'property' : 'properties'} ({tourRequests.length} requests)
                      </Text>
                      <TouchableOpacity
                        style={styles.sortButton}
                        onPress={() => {
                          setSortNewestFirst((prev) => !prev);
                          setTourPage(0);
                          tourListRef.current?.scrollToOffset({ offset: 0, animated: false });
                        }}
                      >
                        <Ionicons
                          name={sortNewestFirst ? 'arrow-down' : 'arrow-up'}
                          size={14}
                          color={colors.ink600}
                        />
                        <Text style={styles.sortButtonText}>
                          {sortNewestFirst ? 'Newest first' : 'Oldest first'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Horizontal paged list of property groups */}
                    <FlatList<PropertyGroup[]>
                      ref={tourListRef}
                      data={groupPages}
                      keyExtractor={(_, index) => `page-${index}`}
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      onMomentumScrollEnd={onTourPageChange}
                      renderItem={({ item: page }) => (
                        <View style={styles.tourPage}>
                          {page.map((group) => (
                            <TouchableOpacity
                              key={group.propertyAddress}
                              style={styles.tourCard}
                              onPress={() =>
                                navigation.navigate('PropertyTourRequests', {
                                  propertyAddress: group.propertyAddress,
                                  tourRequests: group.requests,
                                })
                              }
                            >
                              <View style={styles.tourHeader}>
                                <Ionicons name="home-outline" size={18} color={colors.navy900} />
                                <Text style={styles.tourAddress} numberOfLines={2}>
                                  {group.propertyAddress}
                                </Text>
                                <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
                              </View>
                              <View style={styles.tourDetails}>
                                <Text style={styles.tourClient}>
                                  {group.requests.length} {group.requests.length === 1 ? 'request' : 'requests'}
                                </Text>
                                <Text style={styles.tourEmail}>
                                  Latest: {group.mostRecent.clientName} · {new Date(group.mostRecent.receivedAt).toLocaleDateString()}
                                </Text>
                              </View>
                              <View style={styles.sourceBadgeRow}>
                                {group.sources.map((src) => (
                                  <View key={src} style={styles.sourceBadge}>
                                    <Text style={styles.sourceBadgeText}>
                                      {src === 'streeteasy' ? 'StreetEasy' : 'Zillow'}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    />

                    {/* Page indicator */}
                    {totalPages > 1 && (
                      <View style={styles.pageIndicator}>
                        {Array.from({ length: totalPages }).map((_, i) => (
                          <View
                            key={i}
                            style={[styles.pageDot, i === tourPage && styles.pageDotActive]}
                          />
                        ))}
                      </View>
                    )}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* Sign Out Button */}
        <SignOutButton
          style={styles.signOutButton}
          textStyle={styles.signOutButtonText}
          text="Sign Out"
        />

        {/* Delete Account Button */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteAccount}
        >
          <Ionicons name="trash-outline" size={20} color={colors.coral500} />
          <Text style={styles.deleteButtonText}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.ink600,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: 40,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.ink200,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 40,
    fontWeight: '600',
    color: colors.white,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.navy50,
    borderRadius: radii.md,
  },
  editButtonText: {
    ...typography.subheading,
    color: colors.navy900,
  },
  infoSection: {
    gap: spacing.md,
    marginBottom: spacing['3xl'],
  },
  infoCard: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.ink200,
  },
  label: {
    ...typography.small,
    color: colors.ink600,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  value: {
    ...typography.body,
    color: colors.ink900,
  },
  applicationSection: {
    marginBottom: spacing['3xl'],
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.ink900,
    marginBottom: spacing.md,
  },
  applicationCard: {
    backgroundColor: colors.white,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.ink200,
    gap: spacing.lg,
  },
  applicationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  applicationTextContainer: {
    flex: 1,
  },
  applicationText: {
    ...typography.subheading,
    color: colors.ink900,
    marginBottom: spacing.xs,
  },
  applicationSubtext: {
    ...typography.caption,
    color: colors.ink600,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.navy400,
  },
  uploadButtonText: {
    ...typography.subheading,
    color: colors.navy900,
  },
  emailTemplateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.ink200,
    marginTop: spacing.lg,
  },
  emailTemplateButtonText: {
    flex: 1,
    ...typography.subheading,
    color: colors.ink900,
  },
  signOutButton: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: radii.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.ink200,
  },
  signOutButtonText: {
    ...typography.subheading,
    color: colors.ink900,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  deleteButtonText: {
    ...typography.subheading,
    color: colors.coral500,
  },
  calLinkSection: {
    marginBottom: spacing['3xl'],
  },
  calLinkRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  calLinkInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.ink200,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...typography.body,
    color: colors.ink900,
  },
  calLinkInputFilled: {
    backgroundColor: colors.navy50,
  },
  calLinkSaveButton: {
    backgroundColor: colors.navy900,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  calLinkSaveText: {
    color: colors.white,
    fontWeight: '600',
    ...typography.body,
  },
  zillowSection: {
    marginBottom: spacing['3xl'],
  },
  connectGmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.navy400,
  },
  connectGmailText: {
    ...typography.subheading,
    color: colors.navy900,
  },
  gmailActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  reconnectGmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  reconnectGmailText: {
    ...typography.caption,
    color: colors.ink600,
  },
  tourListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tourCount: {
    fontSize: 13,
    color: colors.ink400,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  sortButtonText: {
    fontSize: 13,
    color: colors.ink600,
    fontWeight: '500',
  },
  tourPage: {
    width: Dimensions.get('window').width - 40,
  },
  pageIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  pageDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#d1d5db',
  },
  pageDotActive: {
    backgroundColor: colors.navy900,
    width: 20,
    borderRadius: 4,
  },
  emptyTours: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.ink200,
  },
  emptyToursText: {
    ...typography.subheading,
    color: colors.ink600,
    marginTop: spacing.sm,
  },
  emptyToursSubtext: {
    ...typography.caption,
    color: colors.ink400,
    marginTop: spacing.xs,
  },
  tourCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.ink200,
    padding: spacing.lg,
    marginBottom: 10,
  },
  tourHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tourAddress: {
    flex: 1,
    ...typography.subheading,
    color: colors.ink900,
  },
  tourDetails: {
    marginBottom: spacing.sm,
  },
  tourClient: {
    ...typography.body,
    fontWeight: '500',
    color: colors.ink900,
  },
  tourEmail: {
    ...typography.caption,
    color: colors.ink600,
    marginTop: 2,
  },
  tourPhone: {
    ...typography.caption,
    color: colors.ink600,
    marginTop: 2,
  },
  tourDate: {
    ...typography.caption,
    color: colors.ink400,
  },
  sourceBadgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sourceBadge: {
    backgroundColor: colors.ink50,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    marginRight: spacing.xs,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.ink600,
  },
});

export default ProfileScreen;
