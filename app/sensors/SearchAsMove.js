import { default as React, Component } from 'react';
import { render } from 'react-dom';
import {ItemCheckboxList} from './component/ItemCheckboxList.js';
import {queryObject} from '../middleware/ImmutableQuery.js';
var helper = require('../middleware/helper.js');

export class SearchAsMove extends Component {
  constructor(props) {
    super(props);
    this.state = {
      items: []
    };
    this.handleSelect = this.handleSelect.bind(this);
    this.handleRemove = this.handleRemove.bind(this);
  }
  componentDidMount() {
    this.setState({
      items: [{
        key: "Search as I move the map",
        value: true,
        status: this.props.searchAsMoveDefault
      }]
    });
    if(this.props.searchAsMoveDefault && this.props.searchAsMoveDefault === true) {
      this.handleSelect(this.props.searchAsMoveDefault);
    }
  }
  // Handler function when a value is selected
  handleSelect(value) {
    this.props.searchAsMoveChange(true);
  }
  // Handler function when a value is deselected or removed
  handleRemove(value) {
    this.props.searchAsMoveChange(false);
  }
  render() {
    let listComponent;
    listComponent = <ItemCheckboxList
      showTags={false}
      items={this.state.items}
      onSelect={this.handleSelect}
      onRemove={this.handleRemove}
      showCount={this.props.showCount} />
    return (
      <div className="searchAsMove">
        {listComponent}
      </div>
    );
  }

}

SearchAsMove.propTypes = {  
};
// Default props value
SearchAsMove.defaultProps = {
  fieldName: 'SearchAsMove',
  searchAsMoveDefault: false
};