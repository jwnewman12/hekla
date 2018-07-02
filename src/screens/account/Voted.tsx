import * as React from 'react';
import { FlatList } from 'react-native';
import { observable, IObservableArray } from 'mobx';
import { observer } from 'mobx-react';
import { Navigation } from 'react-native-navigation';
import { autobind } from 'core-decorators';
import StoryCard from 'components/story-card/StoryCard';
import CommentCard from 'components/comment-card/CommentCard';
import Loading from 'components/loading/Loading';
import Empty from 'components/empty/Empty';
import UI from 'stores/UI';
import Items from 'stores/Items';
import Item from 'stores/models/Item';
import Account from 'stores/Account';
import { applyThemeOptions } from 'styles';

type IItemType = typeof Item.Type;
type VotedResult = {
  id: string;
  parentId: string;
};

interface Props {
  userId: string;
  componentId: string;
}

@observer
export default class AccountVotedScreen extends React.Component<Props> {

  static get options() {
    return applyThemeOptions({
      topBar: {
        title: {
          text: 'Voted',
        },
      },
    });
  }

  page = 1;
  hasNextPage = true;

  @observable
  isLoading = false;

  @observable
  isRefreshing = false;

  @observable
  voted = [] as IObservableArray;

  componentWillMount() {
    this.fetch();
  }

  componentDidAppear() {
    this.updateOptions();
  }

  @autobind
  async onRefresh() {
    this.voted.clear();
    this.isRefreshing = true;
    await this.fetch();
    this.isRefreshing = false;
  }

  @autobind
  async onEndReached() {
    if (!this.isLoading && this.hasNextPage) {
      this.page += 1;
      this.fetch();
    }
  }

  @autobind
  updateOptions() {
    Navigation.mergeOptions(this.props.componentId, AccountVotedScreen.options);
  }

  @autobind
  async fetch() {
    this.isLoading = true;
    const noDupes = ([item, parent]) => !this.voted.find(s => s[0].id === item.id);

    // Fetch stories and comments
    const storyIds = await Account.user.fetchVoted('submissions', this.page) as VotedResult[];
    const commentIds = await Account.user.fetchVoted('comments', this.page) as VotedResult[];

    // Map them to real items
    const stories = await Promise.all(storyIds.map(({ id }) =>
      Promise.all([Items.fetchItem(id)])));
    const comments = await Promise.all(commentIds.map(({ id, parentId }) =>
      Promise.all([Items.fetchItem(id), parentId && Items.fetchItem(parentId)])));
    const result = [];

    // As we don't have the date when item was favorited, we're gonna inject
    // comments into the stories array by date and preserve at least one order.
    stories.forEach((items) => {
      for (const [index, comment] of comments.entries()) {
        if (comment[0].time < items[0].time) {
          result.push(comment);
          comments.splice(index, 1);
        }
      }
      result.push(items);
    });

    // Then add rest of the comments
    result.push(...comments);

    const voted = result.filter(noDupes);

    if (voted.length === 0) {
      this.hasNextPage = false;
    }

    this.voted.push(...voted);
    this.isLoading = false;
  }

  @autobind
  keyExtractor(items: IItemType[], index: number) {
    if (!items) return `Item_${index}_Empty`;
    return `Item_${items[0].id}`;
  }

  @autobind
  renderComment({ item }: { item: IItemType[] }) {
    if (!item[0]) return null;

    if (item[0].type === 'comment') {
      return (
        <CommentCard
          key={item[0].id}
          item={item[0]}
          parent={item[1]}
        />
      );
    }

    if (item[0].type === 'story') {
      return (
        <StoryCard
          key={item[0].id}
          item={item[0]}
        />
      );
    }
  }

  render() {
    const isEmpty = !(this.isLoading || this.isRefreshing) && this.voted.length === 0;

    return (
      <FlatList
        testID="USER_FAVORITES_SCREEN"
        data={this.voted}
        extraData={this.voted.length}
        ListFooterComponent={!this.isRefreshing && this.isLoading && <Loading end={true} />}
        ListEmptyComponent={isEmpty && <Empty message="No voted" />}
        keyExtractor={this.keyExtractor}
        renderItem={this.renderComment}
        refreshing={this.isRefreshing}
        onEndReachedThreshold={0.75}
        onRefresh={this.onRefresh}
        onEndReached={this.onEndReached}
        scrollEnabled={UI.scrollEnabled}
      />
    );
  }
}
