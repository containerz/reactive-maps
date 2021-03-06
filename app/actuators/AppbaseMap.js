import { default as React, Component } from 'react';
import { render } from 'react-dom';
import { GoogleMapLoader, GoogleMap, Marker, SearchBox, InfoWindow, Polygon } from "react-google-maps";
import InfoBox from 'react-google-maps/lib/addons/InfoBox';
import { default as MarkerClusterer } from "react-google-maps/lib/addons/MarkerClusterer";
import {queryObject, emitter} from '../middleware/ImmutableQuery.js';
import {manager} from '../middleware/ChannelManager.js';
import {AppbaseSearch} from '../sensors/AppbaseSearch';
import {SearchAsMove} from '../sensors/SearchAsMove';
import {MapStyles} from '../sensors/MapStyles';

var helper = require('../middleware/helper.js');
var Style = require('../helper/Style.js');

export class AppbaseMap extends Component {
  constructor(props) {
    super(props);
    this.state = {
      markers: [],
      selectedMarker: null,
      streamingStatus: 'Intializing..',
      center: this.props.defaultCenter,
      query: {},
      rawData: {
        hits: {
          hits: []
        }
      }
    };
    this.previousSelectedSensor = {};
    this.handleSearch = this.handleSearch.bind(this);
    this.searchAsMoveChange = this.searchAsMoveChange.bind(this);
    this.mapStyleChange = this.mapStyleChange.bind(this);
    this.reposition = false;
  }
  componentDidMount() {
    this.createChannel();
    this.setGeoQueryInfo();
    let currentMapStyle = helper.getMapStyle(this.props.mapStyle);
    this.setState({
      currentMapStyle: currentMapStyle
    });
  }
  // Create a channel which passes the depends and receive results whenever depends changes
  createChannel() {
    // Set the depends - add self aggs query as well with depends
    let depends = this.props.depends ? this.props.depends : {};
    depends['geoQuery'] = { operation: "should" };
    // create a channel and listen the changes
    var channelObj = manager.create(depends);
    channelObj.emitter.addListener(channelObj.channelId, function(res) {
      let data = res.data;
      let rawData, markersData;
      if(res.method === 'stream') {
        rawData = this.state.rawData;
        if(res.data) {
          res.data.stream = true;
        }
        rawData.hits.hits.push(res.data);
        markersData = this.setMarkersData(rawData);
      } else if(res.method === 'historic') {
        rawData = data;
        markersData = this.setMarkersData(data);
      }
      this.reposition = true;
      this.setState({
        rawData: rawData,
        markersData: markersData
      }, function() {
        // Pass the historic or streaming data in index method
        res.allMarkers = rawData;
        this.props.markerOnIndex(res);
      }.bind(this));
    }.bind(this));
  }
  setMarkersData(data) {
    var self = this;
    if(data && data.hits && data.hits.hits) {
      let markersData = data.hits.hits.filter((hit, index) => {
        return hit._source.hasOwnProperty(self.props.inputData) && !(hit._source[self.props.inputData].lat === 0 && hit._source[self.props.inputData].lon === 0);
      });
      markersData = _.orderBy(markersData, [self.props.inputData.lat], ['desc']);
      markersData = markersData.map((marker) => {
        marker.showInfo = false;
        return marker;
      })
      return markersData;
    } else {
      return [];
    }
  }
  // set the query type and input data
  setGeoQueryInfo() {
    var obj = {
        key: 'geoQuery',
        value: {
          queryType: 'geo_bounding_box',
          inputData: this.props.inputData
        }
    };
    helper.selectedSensor.setSensorInfo(obj);
  }
  //Toggle to 'true' to show InfoWindow and re-renders component
  handleMarkerClick(marker) {
    marker.showInfo = true;
    this.reposition = false;
    console.log(marker);
    this.setState({
      rerender: true
    });
  }
  
  handleMarkerClose(marker) {
    marker.showInfo = false;
    this.reposition = false;
    this.setState(this.state);
  }
  renderInfoWindow(ref, marker) {
    var popoverContent = this.props.popoverContent ? this.props.popoverContent(marker) : 'Popver';
    return (
      <InfoWindow 
        zIndex = {500}
        key={`${ref}_info_window`}
        onCloseclick={this.handleMarkerClose.bind(this, marker)} >
        <div>
          {popoverContent}
        </div>  
      </InfoWindow>
    );
    
  }
  // Handle function which is fired when map is moved and reaches to idle position
  handleOnIdle() {
    var mapBounds = this.refs.map.getBounds();
    var north = mapBounds.getNorthEast().lat();
    var south = mapBounds.getSouthWest().lat();
    var east = mapBounds.getNorthEast().lng();
    var west = mapBounds.getSouthWest().lng();
    var boundingBoxCoordinates = {
      "top_left": [west, north],
      "bottom_right": [east, south]
    };
    this.props.mapOnIdle({
      boundingBoxCoordinates: boundingBoxCoordinates,
      mapBounds: mapBounds
    });
    if(this.searchAsMove && !this.searchQueryProgress) {
      this.setValue(boundingBoxCoordinates, this.searchAsMove);
    }
  }
  // set value
  setValue(value, isExecuteQuery=false) {
    var obj = {
        key: 'geoQuery',
        value: value
    };
    helper.selectedSensor.set(obj, isExecuteQuery);
  }
  // on change of selectiong 
  searchAsMoveChange(value) {
    this.searchAsMove = value;
  }
  // mapStyle changes
  mapStyleChange(style) {
    this.setState({
      currentMapStyle: style
    });
  }
  // Handler function for bounds changed which udpates the map center
  handleBoundsChanged() {
    if(!this.searchQueryProgress) {
      // this.setState({
      //   center: this.refs.map.getCenter()
      // });
    } else {
      setTimeout(()=> {
        this.searchQueryProgress = false;
      }, 1000*1);
    }
  }
  // Handler function which is fired when an input is selected from autocomplete google places 
  handlePlacesChanged() {
    const places = this.refs.searchBox.getPlaces();
    // this.setState({
    //   center: places[0].geometry.location
    // });
  }
  // Handler function which is fired when an input is selected from Appbase geo search field
  handleSearch(location) {
    // this.setState({
    //   center: new google.maps.LatLng(location.value.lat, location.value.lon)
    // });
  }
  identifyGeoData(input) {
    let type = Object.prototype.toString.call(input);
    let convertedGeo = null;
    if(type === '[object Object]' && input.hasOwnProperty('lat') && input.hasOwnProperty('lon')) {
      convertedGeo = {
        lat: input.lat,
        lng: input.lon
      };
    }
    else if(type === '[object Array]' && input.length === 2) {
      convertedGeo = {
        lat: input[0],
        lng: input[1]
      };
      console.log(input[0], input[1]);
    }
    return convertedGeo;
  }
  generateMarkers() {
    var self = this;
    let markersData = this.state.markersData;
    let response = {
      markerComponent: [],
      defaultCenter: null,
      convertedGeo: []
    };
    if(markersData) {
      response.markerComponent = markersData.map((hit, index) => {
        let field = self.identifyGeoData(hit._source[self.props.inputData]);
        let icon = hit.stream ? self.props.streamPin : self.props.historicPin;
        if(field) {
          response.convertedGeo.push(field);
          let position = {
            position: field
          };
          let ref = `marker_ref_${index}`;
          let popoverEvent;
          if(this.props.showPopoverOn) {
            popoverEvent = {};
            popoverEvent[this.props.showPopoverOn] = this.handleMarkerClick.bind(this, hit);
          } else {
            popoverEvent = {};
            popoverEvent['onClick'] = this.handleMarkerClick.bind(this, hit);
          }
          return (
            <Marker {...position} 
              key={index} 
              zIndex={1}
              ref={ref}
              icon={icon}
              onClick={() => self.props.markerOnClick(hit._source)}
              onDblclick={() => self.props.markerOnDblclick(hit._source)} 
              onMouseover={() => self.props.markerOnMouseover(hit._source)}
              onMouseout={() => self.props.markerOnMouseout(hit._source)} 
              {...popoverEvent}>
              {hit.showInfo ? self.renderInfoWindow(ref, hit) : null}
            </Marker>
          )
        }
      });
      var median = parseInt(response.convertedGeo.length/2, 10);
      var selectedMarker = response.convertedGeo[median];
      response.defaultCenter = {
        lat: selectedMarker.lat,
        lng: selectedMarker.lng
      };
      
    }
    return response;
  }
  render() {
    var self = this;
    var markerComponent, searchComponent, searchAsMoveComponent, MapStylesComponent;
    let appbaseSearch, titleExists, title = null;
    var searchComponentProps = {};
    var otherOptions;
    var generatedMarkers = this.generateMarkers();
    if (this.props.markerCluster) {
      markerComponent = <MarkerClusterer averageCenter enableRetinaIcons gridSize={ 60 } >
        {generatedMarkers.markerComponent}
      </MarkerClusterer>;
    }
    else {
      markerComponent = generatedMarkers.markerComponent;
    }
    // Auto center using markers data
    if(!this.searchAsMove && this.props.autoCenter && this.reposition) {

      searchComponentProps.center =  generatedMarkers.defaultCenter ? generatedMarkers.defaultCenter : this.state.center;
      this.reposition = false;
    } else {
      delete searchComponentProps.center;
    }
    // include searchasMove component 
    if(this.props.searchAsMoveComponent) {
      searchAsMoveComponent = <SearchAsMove searchAsMoveDefault={this.props.searchAsMoveDefault} searchAsMoveChange={this.searchAsMoveChange} />;
    }
    // include mapStyle choose component 
    if(this.props.MapStylesComponent) {
      MapStylesComponent = <MapStyles defaultSelected={this.props.mapStyle} mapStyleChange={this.mapStyleChange} />;
    }
    // include title if exists
    if(this.props.title) {
      titleExists = true;
      title = (<h2 className="componentTitle col s12">{this.props.title}</h2>);
    }
    //polygon
    let polygonData = this.props.polygonData ? this.props.polygonData : [];
    let polygons = polygonData.map((polyProp, index) => {
      let options = {
        options: polyProp
      };
      return (<Polygon key={index} {...options}  />);
    });
  return(
    <div className="map-container reactiveComponent appbaseMapComponent">
      {title}
      <GoogleMapLoader
        containerElement={
          <div {...this.props} className="containerElement" />
        }
        googleMapElement={<GoogleMap ref = "map"
          options = {{
            styles: this.state.currentMapStyle
          }}
          {...searchComponentProps}
          {...this.props}
          onIdle = {:: this.handleOnIdle}>
          {searchComponent}
          {markerComponent}
          {polygons}
      </GoogleMap>}/>
      <div style= { Style.divStatusStyle } ref= "status" > { this.state.streamingStatus } </div >
      <div style={Style.divAppbaseStyle} >
        Powered by <img width='200px' height='auto' src="http://slashon.appbase.io/img/Appbase.png" /> 
      </div>                
      {searchAsMoveComponent}
      {MapStylesComponent}
    </div >
    )
  }
}
AppbaseMap.propTypes = {
  inputData: React.PropTypes.string.isRequired,
  searchField: React.PropTypes.string,
  searchComponent: React.PropTypes.string,
  markerOnDelete: React.PropTypes.func,
  markerOnIndex: React.PropTypes.func,
  markerCluster: React.PropTypes.bool,
  historicalData: React.PropTypes.bool
};
AppbaseMap.defaultProps = {
  historicalData: true,
  markerCluster: true,
  searchComponent: "google",
  autoCenter: false,
  searchAsMoveComponent: false,
  searchAsMoveDefault: false,
  MapStylesComponent: false,
  mapStyle: 'MapBox',
  title: null,
  historicPin: 'dist/images/historic-pin.png',
  streamPin: 'dist/images/stream-pin.png',
  markerOnClick: function() {},
  markerOnDblclick: function() {},
  markerOnMouseover: function() {},
  markerOnMouseout: function() {},
  markerOnIndex: function() {},
  mapOnIdle: function() {}
};